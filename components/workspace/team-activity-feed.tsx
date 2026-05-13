"use client"

import React, { useState, useEffect } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Activity,
  FileText,
  FilePlus,
  FileEdit,
  Trash2,
  Users,
  Clock,
  ChevronRight
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { formatDistanceToNow } from "date-fns"

interface TeamActivity {
  id: string
  action: string
  actor_id: string
  actor_email?: string
  actor_name?: string
  actor_avatar?: string
  metadata: any
  created_at: string
}

interface TeamActivityFeedProps {
  workspaceId: string
  organizationId?: string | null
  inline?: boolean
}

export function TeamActivityFeed({ workspaceId, organizationId, inline = false }: TeamActivityFeedProps) {
  const [activities, setActivities] = useState<TeamActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (!organizationId || !workspaceId) {
      setActivities([])
      setLoading(false)
      return
    }

    const supabase = createClient()
    // Cache user profiles to avoid re-fetching on every realtime event
    const userCache = new Map<string, any>()

    const enrichActivities = async (rawActivities: any[]): Promise<TeamActivity[]> => {
      if (rawActivities.length === 0) return []

      const actorIds = [...new Set(rawActivities.map(a => a.actor_id))]
      const uncachedIds = actorIds.filter(id => !userCache.has(id))

      if (uncachedIds.length > 0) {
        const { data: userData } = await supabase
          .from('profiles')
          .select('id, email, full_name, avatar_url')
          .in('id', uncachedIds)

        if (userData) {
          userData.forEach((u: any) => userCache.set(u.id, u))
        }
      }

      return rawActivities.map(activity => {
        const profile = userCache.get(activity.actor_id)
        return {
          id: activity.id,
          action: activity.action,
          actor_id: activity.actor_id,
          actor_email: profile?.email,
          actor_name: profile?.full_name || profile?.email?.split('@')[0],
          actor_avatar: profile?.avatar_url,
          metadata: activity.metadata || {},
          created_at: activity.created_at
        }
      })
    }

    const fetchActivities = async () => {
      try {
        const { data, error } = await supabase
          .from('team_activity')
          .select('id, action, actor_id, metadata, created_at')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })
          .limit(20)

        if (error) {
          console.error('[TeamActivityFeed] Error fetching activities:', error)
          setActivities([])
          return
        }

        const enriched = await enrichActivities(data || [])
        setActivities(enriched)
        setLoading(false)
      } catch (error) {
        console.error('[TeamActivityFeed] Error:', error)
        setActivities([])
        setLoading(false)
      }
    }

    fetchActivities()

    // Subscribe to real-time inserts on team_activity
    const channel = supabase
      .channel(`activity:${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'team_activity',
          filter: `workspace_id=eq.${workspaceId}`
        },
        async (payload) => {
          // Enrich the new activity with user profile
          const enriched = await enrichActivities([payload.new])
          if (enriched.length > 0) {
            setActivities(prev => [enriched[0], ...prev].slice(0, 20))
          }
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [workspaceId, organizationId])

  const getActivityIcon = (action: string) => {
    switch (action) {
      case 'file_created':
        return <FilePlus className="h-4 w-4 text-green-500" />
      case 'file_updated':
        return <FileEdit className="h-4 w-4 text-orange-400" />
      case 'file_deleted':
        return <Trash2 className="h-4 w-4 text-red-500" />
      case 'member_joined':
        return <Users className="h-4 w-4 text-purple-500" />
      default:
        return <FileText className="h-4 w-4 text-gray-500" />
    }
  }

  const getActivityMessage = (activity: TeamActivity) => {
    const fileName = activity.metadata?.file_name || activity.metadata?.file_path || 'a file'

    switch (activity.action) {
      case 'file_created':
        return `created ${fileName}`
      case 'file_updated':
        return `edited ${fileName}`
      case 'file_deleted':
        return `deleted ${fileName}`
      case 'member_joined':
        return 'joined the workspace'
      default:
        return activity.action.replace(/_/g, ' ')
    }
  }

  if (!organizationId) {
    return null
  }

  // Inline mode: render directly in the team panel as an accordion
  if (inline) {
    return (
      <div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between px-0 py-2 text-xs font-medium text-gray-300 hover:text-gray-200 transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 bg-orange-500 rounded-sm" />
            <Activity className="h-3.5 w-3.5 text-orange-400" />
            <span className="uppercase tracking-wider text-gray-400 text-[11px] font-semibold">Team Activity</span>
            {activities.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 text-[10px]">
                {activities.length}
              </span>
            )}
          </div>
          {isOpen ? (
            <ChevronRight className="w-3 h-3 text-gray-500 rotate-90 transition-transform" />
          ) : (
            <ChevronRight className="w-3 h-3 text-gray-500 transition-transform" />
          )}
        </button>
        {isOpen && (
          <div className={activities.length > 5 ? "max-h-[200px] overflow-y-auto" : ""}>
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-500" />
              </div>
            ) : activities.length === 0 ? (
              <p className="text-[11px] text-gray-600 py-2">No activity yet</p>
            ) : (
              <div className="space-y-0.5">
                {activities.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-800/30 transition-colors"
                  >
                    <Avatar className="h-5 w-5 mt-0.5 flex-shrink-0">
                      <AvatarImage src={activity.actor_avatar} />
                      <AvatarFallback className="text-[8px] bg-gradient-to-br from-orange-500 to-orange-600 text-white">
                        {(activity.actor_name || activity.actor_email || 'U').charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-gray-300 truncate">
                        <span className="font-medium">{activity.actor_name || activity.actor_email}</span>
                        {' '}
                        <span className="text-gray-500">{getActivityMessage(activity)}</span>
                      </p>
                      <span className="text-[10px] text-gray-600">
                        {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative h-8 w-8 p-0"
          title="Team Activity"
        >
          <Activity className="h-4 w-4" />
          {activities.length > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-orange-500 text-[10px] font-medium text-white flex items-center justify-center">
              {activities.length > 9 ? '9+' : activities.length}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Team Activity
          </SheetTitle>
          <SheetDescription>
            Recent changes and updates in this workspace
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm font-medium">No activity yet</p>
              <p className="text-xs mt-1">Team actions will appear here</p>
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-180px)] pr-4">
              <div className="space-y-1">
                {activities.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors group"
                  >
                    <Avatar className="h-8 w-8 mt-0.5">
                      <AvatarImage src={activity.actor_avatar} alt={activity.actor_name} />
                      <AvatarFallback className="text-xs bg-gradient-to-br from-orange-500 to-orange-600 text-white">
                        {(activity.actor_name || activity.actor_email || 'U').charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {getActivityIcon(activity.action)}
                        <p className="text-sm">
                          <span className="font-medium">{activity.actor_name || activity.actor_email}</span>
                          {' '}
                          <span className="text-muted-foreground">{getActivityMessage(activity)}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                      </div>
                    </div>

                    <ChevronRight className="h-4 w-4 text-muted-foreground md:opacity-0 md:group-hover:opacity-100 transition-opacity" />
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
