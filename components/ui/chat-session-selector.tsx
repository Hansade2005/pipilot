"use client"

import * as React from "react"
import { useState, useEffect, useCallback } from "react"
import { MessageSquare, Plus, MoreHorizontal, Pencil, Trash2, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { ChatSession } from "@/lib/storage-manager"

interface ChatSessionSelectorProps {
  workspaceId: string | null
  userId: string
  currentSessionId?: string | null
  onSessionChange?: (sessionId: string) => void
  onNewSession?: () => void
  compact?: boolean
  className?: string
}

export function ChatSessionSelector({
  workspaceId,
  userId,
  currentSessionId,
  onSessionChange,
  onNewSession,
  compact = false,
  className,
}: ChatSessionSelectorProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState("")
  const [isOpen, setIsOpen] = useState(false)

  // Load chat sessions for this workspace
  const loadSessions = useCallback(async () => {
    if (!workspaceId || !userId) return

    setIsLoading(true)
    try {
      const { storageManager } = await import("@/lib/storage-manager")
      await storageManager.init()
      const allSessions = await storageManager.getChatSessions(userId)

      // Filter sessions for this workspace and sort by lastMessageAt
      const workspaceSessions = allSessions
        .filter((s: ChatSession) => s.workspaceId === workspaceId)
        .sort((a: ChatSession, b: ChatSession) =>
          new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
        )

      setSessions(workspaceSessions)
    } catch (error) {
      console.error("[ChatSessionSelector] Error loading sessions:", error)
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId, userId])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  // Create a new chat session
  const handleNewSession = async () => {
    if (!workspaceId || !userId) return

    try {
      const { storageManager } = await import("@/lib/storage-manager")
      await storageManager.init()

      // Deactivate current active session
      const activeSession = sessions.find(s => s.isActive)
      if (activeSession) {
        await storageManager.updateChatSession(activeSession.id, { isActive: false })
      }

      // Create new session
      const newSession = await storageManager.createChatSession({
        workspaceId,
        userId,
        title: `Chat ${sessions.length + 1}`,
        isActive: true,
      })

      await loadSessions()
      onSessionChange?.(newSession.id)
      onNewSession?.()
      setIsOpen(false)
    } catch (error) {
      console.error("[ChatSessionSelector] Error creating session:", error)
    }
  }

  // Switch to a different session
  const handleSessionSelect = async (sessionId: string) => {
    if (sessionId === currentSessionId) {
      setIsOpen(false)
      return
    }

    try {
      const { storageManager } = await import("@/lib/storage-manager")
      await storageManager.init()

      // Deactivate all sessions for this workspace
      for (const session of sessions) {
        if (session.isActive) {
          await storageManager.updateChatSession(session.id, { isActive: false })
        }
      }

      // Activate the selected session
      await storageManager.updateChatSession(sessionId, { isActive: true })

      await loadSessions()
      onSessionChange?.(sessionId)
      setIsOpen(false)
    } catch (error) {
      console.error("[ChatSessionSelector] Error switching session:", error)
    }
  }

  // Rename a session
  const handleRenameSession = async (sessionId: string) => {
    if (!editingTitle.trim()) {
      setEditingSessionId(null)
      return
    }

    try {
      const { storageManager } = await import("@/lib/storage-manager")
      await storageManager.init()
      await storageManager.updateChatSession(sessionId, { title: editingTitle.trim() })
      await loadSessions()
      setEditingSessionId(null)
    } catch (error) {
      console.error("[ChatSessionSelector] Error renaming session:", error)
    }
  }

  // Delete a session
  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()

    try {
      const { storageManager } = await import("@/lib/storage-manager")
      await storageManager.init()
      await storageManager.deleteChatSession(sessionId)

      // If we deleted the current session, switch to another one or create new
      if (sessionId === currentSessionId) {
        const remainingSessions = sessions.filter(s => s.id !== sessionId)
        if (remainingSessions.length > 0) {
          await handleSessionSelect(remainingSessions[0].id)
        } else {
          await handleNewSession()
        }
      } else {
        await loadSessions()
      }
    } catch (error) {
      console.error("[ChatSessionSelector] Error deleting session:", error)
    }
  }

  // Start editing a session title
  const startEditing = (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingSessionId(session.id)
    setEditingTitle(session.title)
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

  const currentSession = sessions.find(s => s.id === currentSessionId || s.isActive)

  if (!workspaceId) return null

  return (
    <TooltipProvider>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "gap-1.5 h-8",
                  compact ? "px-2" : "px-3",
                  className
                )}
              >
                <MessageSquare className="h-4 w-4" />
                {!compact && (
                  <span className="max-w-[100px] truncate text-xs">
                    {currentSession?.title || "New Chat"}
                  </span>
                )}
                {sessions.length > 1 && (
                  <span className="text-[10px] bg-muted px-1 rounded">
                    {sessions.length}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Chat Sessions ({sessions.length})</p>
          </TooltipContent>
        </Tooltip>

        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel className="flex items-center justify-between">
            <span>Chat Sessions</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={handleNewSession}
            >
              <Plus className="h-3 w-3 mr-1" />
              New
            </Button>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {isLoading ? (
            <div className="py-4 text-center text-sm text-muted-foreground">
              Loading sessions...
            </div>
          ) : sessions.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted-foreground">
              No chat sessions yet
            </div>
          ) : (
            <div className="max-h-[300px] overflow-y-auto">
              {sessions.map((session) => (
                <DropdownMenuItem
                  key={session.id}
                  className={cn(
                    "flex items-center justify-between gap-2 cursor-pointer py-2",
                    session.id === currentSessionId && "bg-accent"
                  )}
                  onClick={() => handleSessionSelect(session.id)}
                >
                  {editingSessionId === session.id ? (
                    <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
                      <Input
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        className="h-6 text-xs"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameSession(session.id)
                          if (e.key === "Escape") setEditingSessionId(null)
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => handleRenameSession(session.id)}
                      >
                        <Check className="h-3 w-3 text-green-500" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => setEditingSessionId(null)}
                      >
                        <X className="h-3 w-3 text-red-500" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate font-medium">
                            {session.title}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatRelativeTime(session.lastMessageAt)} · {session.messageCount || 0} msgs
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {session.isActive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1" />
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 md:opacity-0 md:group-hover:opacity-100 hover:opacity-100"
                          onClick={(e) => startEditing(session, e)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 md:opacity-0 md:group-hover:opacity-100 hover:opacity-100 hover:text-destructive"
                          onClick={(e) => handleDeleteSession(session.id, e)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </>
                  )}
                </DropdownMenuItem>
              ))}
            </div>
          )}

        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  )
}
