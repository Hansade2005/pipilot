"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  MessageSquare,
  Clock,
  User,
  ChevronRight,
  Loader2,
  Share2,
  Trash2,
  Eye,
  MessagesSquare
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

interface SharedChat {
  id: string
  title: string
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
  }>
  project_id: string | null
  shared_by: string
  shared_at: string
  profiles?: {
    full_name: string | null
    email: string | null
    avatar_url: string | null
  }
}

interface TeamSharedChatsProps {
  workspaceId: string | undefined
  organizationId: string | undefined
  userId: string
  onLoadChat?: (messages: SharedChat['messages'], title: string) => void
}

export function TeamSharedChats({
  workspaceId,
  organizationId,
  userId,
  onLoadChat
}: TeamSharedChatsProps) {
  const [chats, setChats] = useState<SharedChat[]>([])
  const [loading, setLoading] = useState(true)
  const [viewingChat, setViewingChat] = useState<SharedChat | null>(null)

  const supabase = createClient()

  const fetchSharedChats = useCallback(async () => {
    if (!organizationId) {
      setChats([])
      setLoading(false)
      return
    }

    try {
      const { data, error } = await supabase
        .from('team_shared_chats')
        .select(`
          id,
          title,
          messages,
          project_id,
          shared_by,
          shared_at,
          profiles:shared_by (full_name, email, avatar_url)
        `)
        .eq('organization_id', organizationId)
        .order('shared_at', { ascending: false })
        .limit(50)

      if (error) throw error
      setChats((data as any) || [])
    } catch (error) {
      console.error('[TeamSharedChats] Error:', error)
    } finally {
      setLoading(false)
    }
  }, [organizationId, supabase])

  useEffect(() => {
    fetchSharedChats()
  }, [fetchSharedChats])

  // Subscribe to real-time changes
  useEffect(() => {
    if (!organizationId) return

    const channel = supabase
      .channel(`shared-chats:${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_shared_chats',
          filter: `organization_id=eq.${organizationId}`
        },
        () => fetchSharedChats()
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [organizationId, fetchSharedChats, supabase])

  const handleDeleteChat = async (chatId: string) => {
    try {
      const { error } = await supabase
        .from('team_shared_chats')
        .delete()
        .eq('id', chatId)

      if (error) throw error

      setChats(prev => prev.filter(c => c.id !== chatId))
      toast.success("Shared chat removed")
      if (viewingChat?.id === chatId) setViewingChat(null)
    } catch (error: any) {
      toast.error(error.message || "Failed to delete")
    }
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  if (!organizationId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center px-4">
        <MessagesSquare className="h-10 w-10 text-gray-600 mb-3" />
        <p className="text-sm text-gray-400">Join a team to see shared chats</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60">
          <div className="flex items-center gap-2">
            <MessagesSquare className="h-4 w-4 text-orange-400" />
            <h3 className="text-sm font-medium text-gray-200">Shared Chats</h3>
            <Badge className="bg-orange-500/10 text-orange-400 text-[10px] px-1.5">
              {chats.length}
            </Badge>
          </div>
        </div>

        {chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <MessageSquare className="h-10 w-10 text-gray-600 mb-3" />
            <p className="text-sm text-gray-400 mb-1">No shared chats yet</p>
            <p className="text-xs text-gray-500">
              Team members can share AI conversations from the chat panel
            </p>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {chats.map(chat => {
                const profile = chat.profiles as any
                const messageCount = chat.messages?.length || 0
                const isOwner = chat.shared_by === userId

                return (
                  <div
                    key={chat.id}
                    className="group flex items-start gap-3 p-3 rounded-lg hover:bg-gray-800/50 transition-colors cursor-pointer"
                    onClick={() => setViewingChat(chat)}
                  >
                    <Avatar className="h-8 w-8 mt-0.5 flex-shrink-0">
                      <AvatarImage src={profile?.avatar_url} />
                      <AvatarFallback className="text-xs bg-gradient-to-br from-orange-500 to-orange-600 text-white">
                        {(profile?.full_name || profile?.email || 'U').charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-200 truncate">
                          {chat.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                        <User className="h-3 w-3" />
                        <span className="truncate">{profile?.full_name || profile?.email || 'Unknown'}</span>
                        <span>-</span>
                        <Clock className="h-3 w-3" />
                        <span>{formatTime(chat.shared_at)}</span>
                        <span>-</span>
                        <MessageSquare className="h-3 w-3" />
                        <span>{messageCount} msgs</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {onLoadChat && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-gray-400 hover:text-orange-400 hover:bg-orange-500/10"
                          title="Load into chat"
                          onClick={(e) => {
                            e.stopPropagation()
                            onLoadChat(chat.messages, chat.title)
                            toast.success("Chat loaded")
                          }}
                        >
                          <Share2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {isOwner && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-gray-400 hover:text-red-400 hover:bg-red-500/10"
                          title="Delete"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteChat(chat.id)
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <ChevronRight className="h-4 w-4 text-gray-600" />
                    </div>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Chat viewer dialog */}
      <Dialog open={!!viewingChat} onOpenChange={() => setViewingChat(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] bg-gray-900 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle className="text-gray-100 flex items-center gap-2">
              <Eye className="h-4 w-4 text-orange-400" />
              {viewingChat?.title}
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Shared by {(viewingChat?.profiles as any)?.full_name || (viewingChat?.profiles as any)?.email || 'Unknown'} - {viewingChat?.shared_at ? formatTime(viewingChat.shared_at) : ''}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-4 py-2">
              {viewingChat?.messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="h-7 w-7 rounded-full bg-gray-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <MessageSquare className="h-3.5 w-3.5 text-orange-400" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-orange-600 text-white rounded-br-sm'
                        : 'bg-gray-800 text-gray-200 rounded-bl-sm'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">
                      {typeof msg.content === 'string'
                        ? msg.content.length > 500
                          ? msg.content.slice(0, 500) + '...'
                          : msg.content
                        : '[Complex content]'
                      }
                    </p>
                  </div>
                  {msg.role === 'user' && (
                    <div className="h-7 w-7 rounded-full bg-orange-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User className="h-3.5 w-3.5 text-white" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
          {onLoadChat && viewingChat && (
            <div className="flex justify-end pt-2 border-t border-gray-800/60">
              <Button
                onClick={() => {
                  onLoadChat(viewingChat.messages, viewingChat.title)
                  setViewingChat(null)
                  toast.success("Chat loaded into workspace")
                }}
                className="bg-orange-600 hover:bg-orange-500 text-white"
              >
                <Share2 className="h-4 w-4 mr-2" />
                Load into Chat
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
