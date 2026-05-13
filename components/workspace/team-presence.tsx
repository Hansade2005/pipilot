"use client"

import React, { useState, useEffect } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Users } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

interface TeamMember {
  id: string
  email: string
  name?: string
  avatar_url?: string
  isOnline?: boolean
  lastSeen?: string
}

interface TeamPresenceProps {
  workspaceId: string
  organizationId?: string | null
  className?: string
  compact?: boolean
}

export function TeamPresence({ workspaceId, organizationId, className, compact = false }: TeamPresenceProps) {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!organizationId) {
      setTeamMembers([])
      setLoading(false)
      return
    }

    const supabase = createClient()
    const onlineUserIds = new Set<string>()

    const fetchAndEnrichMembers = async () => {
      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        setCurrentUserId(user?.id || null)

        // Fetch team members
        const { data: members, error } = await supabase
          .from('team_members')
          .select('user_id, role')
          .eq('organization_id', organizationId)
          .eq('status', 'active')

        if (error || !members || members.length === 0) {
          setTeamMembers([])
          setLoading(false)
          return
        }

        const userIds = members.map((m: any) => m.user_id)

        // Fetch profiles
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email, full_name, avatar_url')
          .in('id', userIds)

        const profileMap = new Map(
          (profiles || []).map((p: any) => [p.id, p])
        )

        const enriched: TeamMember[] = members
          .map((m: any) => {
            const profile = profileMap.get(m.user_id)
            return {
              id: m.user_id,
              email: profile?.email || '',
              name: profile?.full_name || profile?.email?.split('@')[0],
              avatar_url: profile?.avatar_url,
              isOnline: onlineUserIds.has(m.user_id),
              lastSeen: new Date().toISOString()
            }
          })
          .filter((m: TeamMember) => m.id)

        setTeamMembers(enriched)
        setLoading(false)
      } catch (error) {
        console.error('[TeamPresence] Error:', error)
        setTeamMembers([])
        setLoading(false)
      }
    }

    // Set up Realtime presence channel
    const channel = supabase.channel(`presence:${organizationId}:${workspaceId}`, {
      config: { presence: { key: '' } } // Will be set on track
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        onlineUserIds.clear()
        Object.values(state).forEach((presences: any) => {
          presences.forEach((p: any) => {
            if (p.user_id) onlineUserIds.add(p.user_id)
          })
        })
        // Update online status on existing members
        setTeamMembers(prev =>
          prev.map(m => ({
            ...m,
            isOnline: onlineUserIds.has(m.id)
          }))
        )
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        newPresences.forEach((p: any) => {
          if (p.user_id) onlineUserIds.add(p.user_id)
        })
        setTeamMembers(prev =>
          prev.map(m => ({
            ...m,
            isOnline: onlineUserIds.has(m.id)
          }))
        )
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        leftPresences.forEach((p: any) => {
          if (p.user_id) onlineUserIds.delete(p.user_id)
        })
        setTeamMembers(prev =>
          prev.map(m => ({
            ...m,
            isOnline: onlineUserIds.has(m.id)
          }))
        )
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Track our own presence
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            await channel.track({
              user_id: user.id,
              online_at: new Date().toISOString()
            })
          }
        }
      })

    fetchAndEnrichMembers()

    return () => {
      channel.unsubscribe()
    }
  }, [workspaceId, organizationId])

  if (!organizationId || loading) {
    return null
  }

  if (teamMembers.length === 0) {
    return null
  }

  // Filter out current user for display
  const otherMembers = teamMembers.filter(m => m.id !== currentUserId)
  const displayMembers = otherMembers.slice(0, 5) // Show max 5 avatars
  const remainingCount = otherMembers.length - displayMembers.length

  return (
    <TooltipProvider>
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="flex items-center">
          <Users className={`${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} text-muted-foreground mr-1.5`} />
          <div className={`flex ${compact ? '-space-x-1.5' : '-space-x-2'}`}>
            {displayMembers.map((member) => (
              <Tooltip key={member.id}>
                <TooltipTrigger asChild>
                  <div className="relative">
                    <Avatar className={`${compact ? 'h-5 w-5 border' : 'h-7 w-7 border-2'} border-background hover:z-10 transition-transform hover:scale-110`}>
                      <AvatarImage src={member.avatar_url} alt={member.name || member.email} />
                      <AvatarFallback className={`${compact ? 'text-[8px]' : 'text-xs'} bg-gradient-to-br from-orange-500 to-orange-600 text-white`}>
                        {(member.name || member.email).charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {member.isOnline && (
                      <div className={`absolute bottom-0 right-0 rounded-full bg-green-500 ${compact ? 'h-1.5 w-1.5 border border-background' : 'h-2.5 w-2.5 border-2 border-background'}`} />
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side={compact ? 'top' : 'bottom'} className="text-xs">
                  <div>
                    <p className="font-medium">{member.name || member.email}</p>
                    <p className="text-muted-foreground text-[10px]">
                      {member.isOnline ? 'Online' : 'Offline'}
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            ))}
            {remainingCount > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={`flex items-center justify-center rounded-full bg-muted ${compact ? 'h-5 w-5 border text-[8px]' : 'h-7 w-7 border-2 text-xs'} border-background font-medium text-muted-foreground hover:z-10 transition-transform hover:scale-110 cursor-default`}>
                    +{remainingCount}
                  </div>
                </TooltipTrigger>
                <TooltipContent side={compact ? 'top' : 'bottom'} className="text-xs">
                  {remainingCount} more team member{remainingCount !== 1 ? 's' : ''}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
        <Badge variant="outline" className={`${compact ? 'h-4 px-1.5 text-[9px]' : 'h-5 px-2 text-[10px]'} text-muted-foreground border-muted`}>
          {teamMembers.length} member{teamMembers.length !== 1 ? 's' : ''}
        </Badge>
      </div>
    </TooltipProvider>
  )
}
