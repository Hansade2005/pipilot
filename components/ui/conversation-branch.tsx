"use client"

import * as React from "react"
import { useState, useCallback, useMemo } from "react"
import {
  GitBranch,
  GitMerge,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  MessageSquare,
  Clock,
  Tag,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export interface ConversationBranch {
  id: string
  name: string
  description?: string
  parentMessageId: string // The message this branch starts from
  createdAt: string
  messageCount: number
  isActive: boolean
  tags?: string[]
}

interface ConversationBranchProps {
  branches: ConversationBranch[]
  currentBranchId?: string
  messages: Array<{ id: string; content: string; role: string }>
  onCreateBranch: (messageId: string, name: string, description?: string) => void
  onSwitchBranch: (branchId: string) => void
  onDeleteBranch: (branchId: string) => void
  onRenameBranch: (branchId: string, newName: string) => void
  onMergeBranch?: (sourceBranchId: string, targetBranchId: string) => void
  className?: string
}

// Branch creation dialog
interface CreateBranchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  messagePreview?: string
  onCreateBranch: (name: string, description?: string) => void
}

export function CreateBranchDialog({
  open,
  onOpenChange,
  messagePreview,
  onCreateBranch,
}: CreateBranchDialogProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")

  const handleCreate = () => {
    if (name.trim()) {
      onCreateBranch(name.trim(), description.trim() || undefined)
      setName("")
      setDescription("")
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Create Branch
          </DialogTitle>
          <DialogDescription>
            Create a new conversation branch from this message. You can explore
            different approaches without losing your current progress.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Message preview */}
          {messagePreview && (
            <div className="bg-muted/50 rounded-md p-3">
              <p className="text-xs text-muted-foreground mb-1">Branching from:</p>
              <p className="text-sm line-clamp-2">{messagePreview}</p>
            </div>
          )}

          {/* Branch name */}
          <div>
            <label className="text-sm font-medium">Branch Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., 'dark-mode-approach', 'auth-v2'"
              className="mt-1"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium">Description (optional)</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What are you trying to explore?"
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim()}>
            <GitBranch className="h-4 w-4 mr-2" />
            Create Branch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Branch item component
function BranchItem({
  branch,
  isActive,
  isEditing,
  editingName,
  onSelect,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditingNameChange,
  onDelete,
}: {
  branch: ConversationBranch
  isActive: boolean
  isEditing: boolean
  editingName: string
  onSelect: () => void
  onStartEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onEditingNameChange: (name: string) => void
  onDelete: () => void
}) {
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

  return (
    <div
      className={cn(
        "flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors group",
        isActive
          ? "bg-primary/10 border border-primary/30"
          : "hover:bg-muted/50 border border-transparent"
      )}
      onClick={onSelect}
    >
      <GitBranch className={cn(
        "h-4 w-4 shrink-0",
        isActive ? "text-primary" : "text-muted-foreground"
      )} />

      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <Input
              value={editingName}
              onChange={(e) => onEditingNameChange(e.target.value)}
              className="h-6 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") onSaveEdit()
                if (e.key === "Escape") onCancelEdit()
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={onSaveEdit}
            >
              <Check className="h-3 w-3 text-green-500" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={onCancelEdit}
            >
              <X className="h-3 w-3 text-red-500" />
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <p className={cn(
                "text-sm font-medium truncate",
                isActive && "text-primary"
              )}>
                {branch.name}
              </p>
              {isActive && (
                <Badge variant="secondary" className="text-[9px] px-1 py-0">
                  Active
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <MessageSquare className="h-2.5 w-2.5" />
                {branch.messageCount}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                {formatRelativeTime(branch.createdAt)}
              </span>
            </div>
          </>
        )}
      </div>

      {!isEditing && (
        <div className="flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={(e) => {
              e.stopPropagation()
              onStartEdit()
            }}
          >
            <Edit3 className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  )
}

// Main conversation branch component
export function ConversationBranchManager({
  branches,
  currentBranchId,
  messages,
  onCreateBranch,
  onSwitchBranch,
  onDeleteBranch,
  onRenameBranch,
  onMergeBranch,
  className,
}: ConversationBranchProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")

  // Get current branch
  const currentBranch = useMemo(() => {
    return branches.find((b) => b.id === currentBranchId)
  }, [branches, currentBranchId])

  // Handle branch creation from a message
  const handleCreateFromMessage = useCallback(
    (messageId: string) => {
      setSelectedMessageId(messageId)
      setCreateDialogOpen(true)
    },
    []
  )

  // Handle branch creation
  const handleCreateBranch = useCallback(
    (name: string, description?: string) => {
      if (selectedMessageId) {
        onCreateBranch(selectedMessageId, name, description)
        setSelectedMessageId(null)
      }
    },
    [selectedMessageId, onCreateBranch]
  )

  // Handle edit start
  const handleStartEdit = useCallback((branch: ConversationBranch) => {
    setEditingBranchId(branch.id)
    setEditingName(branch.name)
  }, [])

  // Handle edit save
  const handleSaveEdit = useCallback(() => {
    if (editingBranchId && editingName.trim()) {
      onRenameBranch(editingBranchId, editingName.trim())
    }
    setEditingBranchId(null)
    setEditingName("")
  }, [editingBranchId, editingName, onRenameBranch])

  // Get message preview for branch creation
  const selectedMessagePreview = useMemo(() => {
    if (!selectedMessageId) return undefined
    const message = messages.find((m) => m.id === selectedMessageId)
    return message?.content.slice(0, 100) + (message?.content && message.content.length > 100 ? "..." : "")
  }, [selectedMessageId, messages])

  return (
    <TooltipProvider>
      <div className={cn("border rounded-lg bg-card", className)}>
        {/* Header */}
        <div
          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Branches</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {branches.length}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {currentBranch && (
              <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                {currentBranch.name}
              </span>
            )}
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Branch list */}
        {isExpanded && (
          <div className="border-t">
            <ScrollArea className="max-h-48">
              <div className="p-2 space-y-1">
                {branches.length === 0 ? (
                  <div className="text-center py-4 text-sm text-muted-foreground">
                    <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p>No branches yet</p>
                    <p className="text-[10px] mt-1">
                      Create a branch to explore different approaches
                    </p>
                  </div>
                ) : (
                  branches.map((branch) => (
                    <BranchItem
                      key={branch.id}
                      branch={branch}
                      isActive={branch.id === currentBranchId}
                      isEditing={editingBranchId === branch.id}
                      editingName={editingName}
                      onSelect={() => onSwitchBranch(branch.id)}
                      onStartEdit={() => handleStartEdit(branch)}
                      onSaveEdit={handleSaveEdit}
                      onCancelEdit={() => {
                        setEditingBranchId(null)
                        setEditingName("")
                      }}
                      onEditingNameChange={setEditingName}
                      onDelete={() => onDeleteBranch(branch.id)}
                    />
                  ))
                )}
              </div>
            </ScrollArea>

            {/* Quick action */}
            <div className="border-t px-2 py-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-7 text-xs justify-start"
                    onClick={() => {
                      // Use last message for branching
                      const lastMessage = messages[messages.length - 1]
                      if (lastMessage) {
                        handleCreateFromMessage(lastMessage.id)
                      }
                    }}
                  >
                    <Plus className="h-3 w-3 mr-2" />
                    New Branch from Here
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Create a new branch from the current conversation point
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}

        {/* Create branch dialog */}
        <CreateBranchDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          messagePreview={selectedMessagePreview}
          onCreateBranch={handleCreateBranch}
        />
      </div>
    </TooltipProvider>
  )
}

// Message-level branch button (to be used inline with messages)
export function BranchFromMessageButton({
  messageId,
  onBranch,
}: {
  messageId: string
  onBranch: (messageId: string) => void
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] md:opacity-0 md:group-hover:opacity-100 transition-opacity"
            onClick={() => onBranch(messageId)}
          >
            <GitBranch className="h-3 w-3 mr-1" />
            Branch
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Create a new branch from this message
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
