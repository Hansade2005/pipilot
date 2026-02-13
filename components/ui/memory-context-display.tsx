"use client"

import * as React from "react"
import { useState, useEffect, useCallback } from "react"
import {
  Brain,
  ChevronDown,
  ChevronUp,
  Trash2,
  RefreshCw,
  FileCode,
  Settings,
  Clock,
  Lightbulb,
  Code,
  Database,
  Layers,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

interface MemoryItem {
  id: string
  type: "preference" | "pattern" | "context" | "insight"
  content: string
  timestamp: string
  source?: string
}

interface ProjectMemory {
  projectType?: string
  framework?: string
  dependencies?: string[]
  lastSession?: string
  keyInsights?: string[]
  technicalPatterns?: string[]
  architecturalDecisions?: string[]
  userPreferences?: string[]
}

interface MemoryContextDisplayProps {
  workspaceId: string | null
  userId: string
  className?: string
  compact?: boolean
  onMemoryUpdate?: (memory: ProjectMemory) => void
}

export function MemoryContextDisplay({
  workspaceId,
  userId,
  className,
  compact = false,
  onMemoryUpdate,
}: MemoryContextDisplayProps) {
  const [isOpen, setIsOpen] = useState(!compact)
  const [isLoading, setIsLoading] = useState(false)
  const [memory, setMemory] = useState<ProjectMemory | null>(null)
  const [memoryItems, setMemoryItems] = useState<MemoryItem[]>([])

  // Load memory from storage
  const loadMemory = useCallback(async () => {
    if (!workspaceId || !userId) return

    setIsLoading(true)
    try {
      const { storageManager } = await import("@/lib/storage-manager")
      await storageManager.init()

      // Get conversation memory for this workspace
      const conversationMemory = await storageManager.getConversationMemory(workspaceId)

      if (conversationMemory) {
        const projectMemory: ProjectMemory = {
          lastSession: conversationMemory.updatedAt,
          keyInsights: conversationMemory.aiInsights || [],
          technicalPatterns: conversationMemory.technicalPatterns || [],
          architecturalDecisions: conversationMemory.architecturalDecisions || [],
        }

        // Parse summary for additional context
        if (conversationMemory.summary) {
          projectMemory.keyInsights = [
            ...(projectMemory.keyInsights || []),
            ...(conversationMemory.summary.keyPoints || []),
          ]
        }

        setMemory(projectMemory)

        // Build memory items for display
        const items: MemoryItem[] = []

        conversationMemory.aiInsights?.forEach((insight, i) => {
          items.push({
            id: `insight-${i}`,
            type: "insight",
            content: insight,
            timestamp: conversationMemory.updatedAt,
          })
        })

        conversationMemory.technicalPatterns?.forEach((pattern, i) => {
          items.push({
            id: `pattern-${i}`,
            type: "pattern",
            content: pattern,
            timestamp: conversationMemory.updatedAt,
          })
        })

        conversationMemory.architecturalDecisions?.forEach((decision, i) => {
          items.push({
            id: `decision-${i}`,
            type: "context",
            content: decision,
            timestamp: conversationMemory.updatedAt,
          })
        })

        setMemoryItems(items)
        onMemoryUpdate?.(projectMemory)
      }
    } catch (error) {
      console.error("[MemoryContextDisplay] Error loading memory:", error)
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId, userId, onMemoryUpdate])

  useEffect(() => {
    loadMemory()
  }, [loadMemory])

  // Clear specific memory item
  const clearMemoryItem = async (itemId: string) => {
    setMemoryItems((prev) => prev.filter((item) => item.id !== itemId))
    // In production, you'd also update the storage
  }

  // Clear all memory
  const clearAllMemory = async () => {
    if (!workspaceId) return

    try {
      const { storageManager } = await import("@/lib/storage-manager")
      await storageManager.init()
      await storageManager.deleteConversationMemory(workspaceId)
      setMemory(null)
      setMemoryItems([])
    } catch (error) {
      console.error("[MemoryContextDisplay] Error clearing memory:", error)
    }
  }

  // Format relative time
  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  const getTypeIcon = (type: MemoryItem["type"]) => {
    switch (type) {
      case "preference":
        return Settings
      case "pattern":
        return Code
      case "context":
        return Layers
      case "insight":
        return Lightbulb
      default:
        return Brain
    }
  }

  const getTypeBadgeColor = (type: MemoryItem["type"]) => {
    switch (type) {
      case "preference":
        return "bg-purple-500/20 text-purple-600 border-purple-500/30"
      case "pattern":
        return "bg-blue-500/20 text-blue-600 border-blue-500/30"
      case "context":
        return "bg-green-500/20 text-green-600 border-green-500/30"
      case "insight":
        return "bg-yellow-500/20 text-yellow-600 border-yellow-500/30"
      default:
        return "bg-gray-500/20 text-gray-600 border-gray-500/30"
    }
  }

  if (!workspaceId) return null

  // Compact view for header display
  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn("gap-1.5 h-8 px-2", className)}
              onClick={() => setIsOpen(!isOpen)}
            >
              <Brain className="h-4 w-4" />
              {memoryItems.length > 0 && (
                <span className="text-[10px] bg-primary/20 px-1 rounded">
                  {memoryItems.length}
                </span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <div className="space-y-1">
              <p className="font-medium">AI Memory</p>
              <p className="text-xs text-muted-foreground">
                {memoryItems.length > 0
                  ? `${memoryItems.length} items remembered`
                  : "No memories yet"}
              </p>
              {memory?.lastSession && (
                <p className="text-[10px] text-muted-foreground">
                  Last updated: {formatRelativeTime(memory.lastSession)}
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  // Full view for chat panel
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={className}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between px-3 py-2 bg-muted/30 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Context Memory</span>
            {memoryItems.length > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {memoryItems.length}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {isLoading ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    loadMemory()
                  }}
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </>
            )}
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="px-3 py-2 space-y-2">
          {/* Project context summary */}
          {memory && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              {memory.projectType && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <FileCode className="h-3 w-3" />
                  <span>{memory.projectType}</span>
                </div>
              )}
              {memory.framework && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Layers className="h-3 w-3" />
                  <span>{memory.framework}</span>
                </div>
              )}
              {memory.lastSession && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>{formatRelativeTime(memory.lastSession)}</span>
                </div>
              )}
            </div>
          )}

          {/* Memory items */}
          {memoryItems.length > 0 ? (
            <ScrollArea className="max-h-40">
              <div className="space-y-1.5">
                {memoryItems.slice(0, 10).map((item) => {
                  const Icon = getTypeIcon(item.type)
                  return (
                    <div
                      key={item.id}
                      className="flex items-start gap-2 p-2 rounded-md bg-muted/30 group"
                    >
                      <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs line-clamp-2">{item.content}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[9px] px-1 py-0",
                              getTypeBadgeColor(item.type)
                            )}
                          >
                            {item.type}
                          </Badge>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                        onClick={() => clearMemoryItem(item.id)}
                      >
                        <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-4 text-xs text-muted-foreground">
              <Brain className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>No memories yet</p>
              <p className="text-[10px] mt-1">
                AI will remember important context as you chat
              </p>
            </div>
          )}

          {/* Clear all button */}
          {memoryItems.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs text-muted-foreground hover:text-destructive"
              onClick={clearAllMemory}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Clear All Memory
            </Button>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
