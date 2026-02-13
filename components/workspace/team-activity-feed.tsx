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
}

export function TeamActivityFeed({ workspaceId, organizationId }: TeamActivityFeedProps) {
  const [activities, setActivities] = useState<TeamActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (!organizationId || !workspaceId) {
      setActivities([])
      setLoading(false)
      return
    }

    const fetchActivities = async () => {
      try {
        const supabase = createClient()

        // Fetch recent activities
        const { data, error } = await supabase
          .from('team_activity')
          .select(`
            id,
            action,
            actor_id,
            metadata,
            created_at
          `)
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })
          .limit(20)

        if (error) {
          console.error('[TeamActivityFeed] Error fetching activities:', error)
          setActivities([])
          return
        }

        // If we have activities, fetch user data separately
        let transformedActivities: TeamActivity[] = []
        if (data && data.length > 0) {
          // Get unique actor IDs
          const actorIds = [...new Set(data.map((activity: any) => activity.actor_id))]

          // Fetch user data for all actors
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id, email, raw_user_meta_data')
            .in('id', actorIds)

          if (userError) {
            console.error('[TeamActivityFeed] Error fetching user data:', userError)
          }

          // Create a map of user data
          const userMap = new Map()
          if (userData) {
            userData.forEach((user: any) => {
              userMap.set(user.id, user)
            })
          }

          // Transform activities with user data
          transformedActivities = data.map((activity: any) => {
            const user = userMap.get(activity.actor_id)
            return {
              id: activity.id,
              action: activity.action,
              actor_id: activity.actor_id,
              actor_email: user?.email,
              actor_name: user?.raw_user_meta_data?.full_name || user?.email?.split('@')[0],
              actor_avatar: user?.raw_user_meta_data?.avatar_url,
              metadata: activity.metadata || {},
              created_at: activity.created_at
            }
          })
        }

        setActivities(transformedActivities)
        setLoading(false)
      } catch (error) {
        console.error('[TeamActivityFeed] Error:', error)
        setActivities([])
        setLoading(false)
      }
    }

    fetchActivities()

    // TODO: Subscribe to real-time updates
    // const subscription = supabase
    //   .channel(`activity:${workspaceId}`)
    //   .on('postgres_changes', { ... }, () => fetchActivities())
    //   .subscribe()
    // return () => { subscription.unsubscribe() }
  }, [workspaceId, organizationId])

  const getActivityIcon = (action: string) => {
    switch (action) {
      case 'file_created':
        return <FilePlus className="h-4 w-4 text-green-500" />
      case 'file_updated':
        return <FileEdit className="h-4 w-4 text-blue-500" />
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
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-blue-500 text-[10px] font-medium text-white flex items-center justify-center">
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
                      <AvatarFallback className="text-xs bg-gradient-to-br from-blue-400 to-purple-400 text-white">
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
