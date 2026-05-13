"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Users,
  Plus,
  UserPlus,
  Crown,
  Shield,
  Pencil,
  Eye,
  Trash2,
  Mail,
  Loader2,
  Copy,
  Check,
  ExternalLink,
  Settings,
  Activity,
  Clock,
  LogOut,
  Building2,
  ArrowRight,
  RefreshCw,
  GitBranch,
  AlertTriangle,
  Key,
  Link as LinkIcon
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { getDeploymentTokens } from "@/lib/cloud-sync"
import { storageManager } from "@/lib/storage-manager"

interface Organization {
  id: string
  name: string
  slug: string
  owner_id: string
  max_members: number
  subscription_plan: string
  settings: any
  created_at: string
}

interface TeamMember {
  id: string
  user_id: string
  role: string
  status: string
  email?: string
  full_name?: string
  avatar_url?: string
}

interface Invitation {
  id: string
  email: string
  role: string
  status: string
  token: string
  expires_at: string
  created_at: string
}

interface TeamPanelProps {
  userId: string
  projectId?: string
  projectName?: string
  organizationId?: string | null
  teamWorkspaceId?: string
  isGitHubBacked?: boolean
  githubRepoUrl?: string
  onOrganizationChange?: (orgId: string | null) => void
  onCreateTeamWorkspace?: (workspace: any) => void
  onWorkspaceDeleted?: () => void
}

export function TeamPanel({ userId, projectId, projectName, organizationId, teamWorkspaceId, isGitHubBacked, githubRepoUrl, onOrganizationChange, onCreateTeamWorkspace, onWorkspaceDeleted }: TeamPanelProps) {
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Dialog states
  const [showCreateOrg, setShowCreateOrg] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [newOrgName, setNewOrgName] = useState("")
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("editor")
  const [isCreating, setIsCreating] = useState(false)
  const [isInviting, setIsInviting] = useState(false)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  // Team workspace creation
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false)
  const [wsName, setWsName] = useState("")
  const [wsRepoName, setWsRepoName] = useState("")
  const [wsGithubToken, setWsGithubToken] = useState("")
  const [wsMode, setWsMode] = useState<"create" | "link">("create")
  const [wsExistingRepo, setWsExistingRepo] = useState("")
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false)
  const [cloudTokenLoaded, setCloudTokenLoaded] = useState(false)
  const [loadingCloudToken, setLoadingCloudToken] = useState(false)
  const [showManualToken, setShowManualToken] = useState(false)

  // GitHub collaborator dialog
  const [showAddCollaborator, setShowAddCollaborator] = useState(false)
  const [collabUsername, setCollabUsername] = useState("")
  const [isAddingCollab, setIsAddingCollab] = useState(false)

  // Delete workspace dialog
  const [showDeleteWorkspace, setShowDeleteWorkspace] = useState(false)
  const [deleteRepoToo, setDeleteRepoToo] = useState(false)
  const [isDeletingWorkspace, setIsDeletingWorkspace] = useState(false)

  // Role change
  const [changingRoleFor, setChangingRoleFor] = useState<string | null>(null)

  // Resend invitation
  const [resendingInvite, setResendingInvite] = useState<string | null>(null)

  // Presence state
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set())

  const supabase = createClient()

  const fetchOrganizations = useCallback(async () => {
    try {
      const { data: memberships, error } = await supabase
        .from('team_members')
        .select(`
          organization_id,
          role,
          organizations:organization_id (*)
        `)
        .eq('user_id', userId)
        .eq('status', 'active')

      if (error) throw error

      const organizations = (memberships || [])
        .filter((m: any) => m.organizations)
        .map((m: any) => m.organizations as Organization)

      setOrgs(organizations)

      // Auto-select org if one matches the current workspace
      if (organizationId) {
        const match = organizations.find(o => o.id === organizationId)
        if (match) setSelectedOrg(match)
      } else if (organizations.length === 1) {
        setSelectedOrg(organizations[0])
      }
    } catch (error) {
      console.error('[TeamPanel] Error fetching orgs:', error)
    }
  }, [userId, organizationId, supabase])

  const fetchMembers = useCallback(async (orgId: string) => {
    try {
      const { data: membersData, error } = await supabase
        .from('team_members')
        .select('id, user_id, role, status')
        .eq('organization_id', orgId)
        .eq('status', 'active')

      if (error) throw error

      if (membersData && membersData.length > 0) {
        const userIds = membersData.map((m: any) => m.user_id)
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email, full_name, avatar_url')
          .in('id', userIds)

        const profileMap = new Map(
          (profiles || []).map((p: any) => [p.id, p])
        )

        const enrichedMembers = membersData.map((m: any) => {
          const profile = profileMap.get(m.user_id)
          return {
            ...m,
            email: profile?.email || '',
            full_name: profile?.full_name || '',
            avatar_url: profile?.avatar_url || '',
          }
        })

        setMembers(enrichedMembers)
      } else {
        setMembers([])
      }
    } catch (error) {
      console.error('[TeamPanel] Error fetching members:', error)
    }
  }, [supabase])

  const fetchInvitations = useCallback(async (orgId: string) => {
    try {
      const { data, error } = await supabase
        .from('team_invitations')
        .select('*')
        .eq('organization_id', orgId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (error) throw error
      setInvitations(data || [])
    } catch (error) {
      console.error('[TeamPanel] Error fetching invitations:', error)
    }
  }, [supabase])

  useEffect(() => {
    const loadAll = async () => {
      setIsLoading(true)
      await fetchOrganizations()
      setIsLoading(false)
    }
    loadAll()
  }, [fetchOrganizations])

  useEffect(() => {
    if (selectedOrg) {
      fetchMembers(selectedOrg.id)
      fetchInvitations(selectedOrg.id)
    }
  }, [selectedOrg, fetchMembers, fetchInvitations])

  // Real-time: refresh org list when user's memberships change (e.g. invited to new org)
  useEffect(() => {
    const membershipChannel = supabase
      .channel(`my-memberships:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_members',
          filter: `user_id=eq.${userId}`
        },
        () => {
          fetchOrganizations()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(membershipChannel)
    }
  }, [userId, supabase, fetchOrganizations])

  // Real-time presence via Supabase Realtime
  useEffect(() => {
    if (!selectedOrg) return

    const channel = supabase.channel(`presence:${selectedOrg.id}`, {
      config: { presence: { key: userId } }
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const online = new Set(Object.keys(state))
        setOnlineUsers(online)
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        setOnlineUsers(prev => new Set([...prev, key]))
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        setOnlineUsers(prev => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: userId,
            online_at: new Date().toISOString(),
          })
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedOrg, userId, supabase])

  // Real-time subscriptions for members and invitations
  useEffect(() => {
    if (!selectedOrg) return

    const membersChannel = supabase
      .channel(`team-members:${selectedOrg.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_members',
          filter: `organization_id=eq.${selectedOrg.id}`
        },
        () => {
          fetchMembers(selectedOrg.id)
        }
      )
      .subscribe()

    const invitationsChannel = supabase
      .channel(`team-invitations:${selectedOrg.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_invitations',
          filter: `organization_id=eq.${selectedOrg.id}`
        },
        () => {
          fetchInvitations(selectedOrg.id)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(membersChannel)
      supabase.removeChannel(invitationsChannel)
    }
  }, [selectedOrg, supabase, fetchMembers, fetchInvitations])

  const handleCreateOrg = async () => {
    if (!newOrgName.trim()) return
    setIsCreating(true)

    try {
      const slug = newOrgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({
          name: newOrgName.trim(),
          slug,
          owner_id: userId,
        })
        .select()
        .single()

      if (orgError) throw orgError

      // Add creator as owner
      const { error: memberError } = await supabase
        .from('team_members')
        .insert({
          organization_id: org.id,
          user_id: userId,
          role: 'owner',
          status: 'active',
        })

      if (memberError) throw memberError

      toast.success("Team created!")
      setShowCreateOrg(false)
      setNewOrgName("")
      setSelectedOrg(org)
      setOrgs(prev => [...prev, org])
      await fetchMembers(org.id)
    } catch (error: any) {
      toast.error(error.message || "Failed to create team")
    } finally {
      setIsCreating(false)
    }
  }

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !selectedOrg) return
    setIsInviting(true)

    try {
      const response = await fetch('/api/teams/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: selectedOrg.id,
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send invitation')
      }

      if (data.method === 'both') {
        toast.success(`Notification & email sent to ${inviteEmail}`)
      } else if (data.method === 'email') {
        toast.success(`Invitation email sent to ${inviteEmail}`)
      } else if (data.method === 'email_failed') {
        toast.success(`Invitation created. Share link: ${data.inviteUrl}`, { duration: 6000 })
      }

      setShowInvite(false)
      setInviteEmail("")
      setInviteRole("editor")
      await fetchInvitations(selectedOrg.id)
    } catch (error: any) {
      toast.error(error.message || "Failed to send invitation")
    } finally {
      setIsInviting(false)
    }
  }

  const handleRemoveMember = async (memberId: string, memberUserId: string) => {
    if (memberUserId === userId) {
      toast.error("You can't remove yourself")
      return
    }

    try {
      const { error } = await supabase
        .from('team_members')
        .update({ status: 'removed' })
        .eq('id', memberId)

      if (error) throw error

      toast.success("Member removed")
      setMembers(prev => prev.filter(m => m.id !== memberId))
    } catch (error: any) {
      toast.error(error.message || "Failed to remove member")
    }
  }

  const handleRevokeInvitation = async (invitationId: string) => {
    try {
      const { error } = await supabase
        .from('team_invitations')
        .delete()
        .eq('id', invitationId)

      if (error) throw error

      toast.success("Invitation revoked")
      setInvitations(prev => prev.filter(i => i.id !== invitationId))
    } catch (error: any) {
      toast.error(error.message || "Failed to revoke invitation")
    }
  }

  // Auto-load GitHub token from cloud sync when dialog opens
  useEffect(() => {
    if (!showCreateWorkspace) {
      setCloudTokenLoaded(false)
      setShowManualToken(false)
      return
    }

    const loadCloudToken = async () => {
      setLoadingCloudToken(true)
      try {
        const tokens = await getDeploymentTokens(userId)
        if (tokens?.github) {
          setWsGithubToken(tokens.github)
          setCloudTokenLoaded(true)
        }
      } catch (err) {
        console.error('[TeamPanel] Error loading cloud token:', err)
      } finally {
        setLoadingCloudToken(false)
      }
    }

    loadCloudToken()
  }, [showCreateWorkspace, userId])

  const handleChangeRole = async (memberId: string, newRole: string) => {
    if (!selectedOrg) return
    setChangingRoleFor(memberId)

    try {
      const response = await fetch('/api/teams/members/update-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: selectedOrg.id,
          memberId,
          newRole,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to update role')

      toast.success(`Role updated to ${newRole}`)
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m))
    } catch (error: any) {
      toast.error(error.message || "Failed to update role")
    } finally {
      setChangingRoleFor(null)
    }
  }

  const handleAddCollaborator = async () => {
    if (!collabUsername.trim() || !teamWorkspaceId) return
    setIsAddingCollab(true)

    try {
      const response = await fetch('/api/teams/github/add-collaborator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamWorkspaceId,
          githubUsername: collabUsername.trim(),
          permission: 'push',
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to add collaborator')

      toast.success(`Invited ${collabUsername} to the GitHub repository`)
      setShowAddCollaborator(false)
      setCollabUsername("")
    } catch (error: any) {
      toast.error(error.message || "Failed to add collaborator")
    } finally {
      setIsAddingCollab(false)
    }
  }

  const handleDeleteWorkspace = async () => {
    if (!teamWorkspaceId) return
    setIsDeletingWorkspace(true)

    try {
      const params = new URLSearchParams({ teamWorkspaceId })
      if (deleteRepoToo) params.set('deleteRepo', 'true')

      const response = await fetch(`/api/teams/github/delete-workspace?${params}`, {
        method: 'DELETE',
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to delete workspace')

      toast.success("Team workspace deleted")
      setShowDeleteWorkspace(false)
      onWorkspaceDeleted?.()
    } catch (error: any) {
      toast.error(error.message || "Failed to delete workspace")
    } finally {
      setIsDeletingWorkspace(false)
    }
  }

  const handleResendInvitation = async (invitationId: string) => {
    setResendingInvite(invitationId)

    try {
      const response = await fetch('/api/teams/invite/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitationId }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to resend invitation')

      toast.success("Invitation extended for 7 more days")
      if (selectedOrg) await fetchInvitations(selectedOrg.id)
    } catch (error: any) {
      toast.error(error.message || "Failed to resend invitation")
    } finally {
      setResendingInvite(null)
    }
  }

  const currentUserRole = members.find(m => m.user_id === userId)?.role

  const handleCreateWorkspace = async () => {
    if (!selectedOrg || !wsName.trim() || !wsGithubToken.trim()) return
    setIsCreatingWorkspace(true)

    try {
      if (wsMode === "create") {
        if (!wsRepoName.trim()) {
          toast.error("Repository name is required")
          return
        }

        // Collect current project files from IndexedDB to push as initial commit
        let initialFiles: Array<{ path: string; content: string }> = []
        if (projectId) {
          try {
            await storageManager.init()
            const files = await storageManager.getFiles(projectId)
            initialFiles = files
              .filter((f: any) => !f.isDirectory && f.content)
              .map((f: any) => ({
                path: (f.path || f.name).replace(/^\//, ''),
                content: f.content,
              }))
          } catch (err) {
            console.warn('[TeamPanel] Could not load project files:', err)
          }
        }

        const response = await fetch('/api/teams/github/create-workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organizationId: selectedOrg.id,
            workspaceName: wsName.trim(),
            githubToken: wsGithubToken.trim(),
            repoName: wsRepoName.trim(),
            initialFiles: initialFiles.length > 0 ? initialFiles : undefined,
          }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Failed to create workspace')

        toast.success(`Workspace created with repo ${data.repoFullName}`)
        setShowCreateWorkspace(false)
        setWsName("")
        setWsRepoName("")
        setWsGithubToken("")
        onCreateTeamWorkspace?.(data.workspace)
      } else {
        if (!wsExistingRepo.trim()) {
          toast.error("Repository name is required (owner/repo)")
          return
        }
        const response = await fetch('/api/teams/github/link-workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organizationId: selectedOrg.id,
            workspaceName: wsName.trim(),
            githubToken: wsGithubToken.trim(),
            repoFullName: wsExistingRepo.trim(),
          }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Failed to link workspace')

        toast.success(`Workspace linked to ${data.repoFullName}`)
        setShowCreateWorkspace(false)
        setWsName("")
        setWsExistingRepo("")
        setWsGithubToken("")
        onCreateTeamWorkspace?.(data.workspace)
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to create workspace")
    } finally {
      setIsCreatingWorkspace(false)
    }
  }

  const copyInviteLink = async (token: string) => {
    const link = `${window.location.origin}/invite/${token}`
    await navigator.clipboard.writeText(link)
    setCopiedToken(token)
    toast.success("Invite link copied!")
    setTimeout(() => setCopiedToken(null), 2000)
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner': return <Crown className="w-3 h-3 text-orange-400" />
      case 'admin': return <Shield className="w-3 h-3 text-orange-300" />
      case 'editor': return <Pencil className="w-3 h-3 text-gray-400" />
      case 'viewer': return <Eye className="w-3 h-3 text-gray-500" />
      default: return null
    }
  }

  const getRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      owner: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
      admin: 'bg-orange-500/10 text-orange-300 border-orange-500/20',
      editor: 'bg-gray-500/10 text-gray-300 border-gray-500/20',
      viewer: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
    }
    return colors[role] || colors.viewer
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading team...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-950">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800/60 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-orange-600/15 flex items-center justify-center">
              <Users className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Teams</h2>
              <p className="text-[11px] text-gray-500">Collaborate in real-time</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {selectedOrg && (
              <Button
                size="sm"
                onClick={() => setShowInvite(true)}
                className="h-7 bg-orange-600 hover:bg-orange-500 text-white text-xs px-2.5"
              >
                <UserPlus className="w-3.5 h-3.5 mr-1" />
                Invite
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* No team yet */}
        {orgs.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-700 bg-gray-900/30 p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-orange-600/15 flex items-center justify-center mx-auto mb-4">
              <Users className="w-6 h-6 text-orange-400" />
            </div>
            <h3 className="text-sm font-semibold text-white mb-2">No team yet</h3>
            <p className="text-xs text-gray-500 mb-4 max-w-sm mx-auto">
              Create a team to collaborate with others on your projects in real-time.
            </p>
            <Button
              size="sm"
              onClick={() => setShowCreateOrg(true)}
              className="bg-orange-600 hover:bg-orange-500 text-white text-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Create Team
            </Button>
          </div>
        )}

        {/* Org Selector (if multiple) */}
        {orgs.length > 1 && (
          <div className="space-y-2">
            <Label className="text-xs text-gray-400">Team</Label>
            <Select
              value={selectedOrg?.id || ''}
              onValueChange={(val) => {
                const org = orgs.find(o => o.id === val)
                setSelectedOrg(org || null)
              }}
            >
              <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
                <SelectValue placeholder="Select a team" />
              </SelectTrigger>
              <SelectContent>
                {orgs.map(org => (
                  <SelectItem key={org.id} value={org.id}>
                    <div className="flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 text-orange-400" />
                      {org.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Single org header */}
        {orgs.length === 1 && selectedOrg && (
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">{selectedOrg.name}</div>
                  <div className="text-[11px] text-gray-500">{members.length} member{members.length !== 1 ? 's' : ''}</div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCreateOrg(true)}
                className="h-7 text-xs text-gray-400 hover:text-orange-400 hover:bg-orange-500/10"
              >
                <Plus className="w-3 h-3 mr-1" />
                New Team
              </Button>
            </div>
          </div>
        )}

        {/* Online Presence */}
        {selectedOrg && members.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 bg-emerald-500 rounded-sm" />
              <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Online ({onlineUsers.size})
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {members.map(member => {
                const isOnline = onlineUsers.has(member.user_id)
                const isCurrentUser = member.user_id === userId
                return (
                  <Tooltip key={member.id}>
                    <TooltipTrigger asChild>
                      <div className="relative">
                        <Avatar className={cn(
                          "h-8 w-8 border-2 transition-all",
                          isOnline ? "border-emerald-500/50" : "border-gray-700 opacity-50"
                        )}>
                          <AvatarImage src={member.avatar_url} />
                          <AvatarFallback className="text-xs bg-gradient-to-br from-orange-500 to-orange-600 text-white">
                            {(member.full_name || member.email || 'U').charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className={cn(
                          "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-950",
                          isOnline ? "bg-emerald-400" : "bg-gray-600"
                        )} />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="text-xs">
                        <p className="font-medium">{member.full_name || member.email}{isCurrentUser ? ' (you)' : ''}</p>
                        <p className="text-gray-400">{isOnline ? 'Online' : 'Offline'} - {member.role}</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                )
              })}
            </div>
          </div>
        )}

        {/* Members List */}
        {selectedOrg && members.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 bg-orange-500 rounded-sm" />
              <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Members</h3>
            </div>
            {members.map(member => {
              const isCurrentUser = member.user_id === userId
              const isOnline = onlineUsers.has(member.user_id)
              return (
                <div
                  key={member.id}
                  className="rounded-xl border border-gray-800 bg-gray-900/50 p-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative flex-shrink-0">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={member.avatar_url} />
                        <AvatarFallback className="text-xs bg-gradient-to-br from-orange-500 to-orange-600 text-white">
                          {(member.full_name || member.email || 'U').charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className={cn(
                        "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-gray-900",
                        isOnline ? "bg-emerald-400" : "bg-gray-600"
                      )} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white truncate">
                          {member.full_name || member.email?.split('@')[0]}
                        </span>
                        {isCurrentUser && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400">You</span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-500 truncate">{member.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    {/* Role selector for owners/admins, badge for others */}
                    {!isCurrentUser && member.role !== 'owner' && (currentUserRole === 'owner' || currentUserRole === 'admin') ? (
                      <Select
                        value={member.role}
                        onValueChange={(val) => handleChangeRole(member.id, val)}
                        disabled={changingRoleFor === member.id}
                      >
                        <SelectTrigger className={cn(
                          "h-6 w-auto min-w-[80px] text-[10px] px-1.5 py-0.5 border bg-transparent gap-1",
                          getRoleBadge(member.role),
                          changingRoleFor === member.id && "opacity-50"
                        )}>
                          <span className="flex items-center gap-1">
                            {changingRoleFor === member.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              getRoleIcon(member.role)
                            )}
                            {member.role}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {currentUserRole === 'owner' && (
                            <SelectItem value="admin">
                              <div className="flex items-center gap-2 text-xs">
                                <Shield className="w-3 h-3 text-orange-300" /> Admin
                              </div>
                            </SelectItem>
                          )}
                          <SelectItem value="editor">
                            <div className="flex items-center gap-2 text-xs">
                              <Pencil className="w-3 h-3 text-gray-400" /> Editor
                            </div>
                          </SelectItem>
                          <SelectItem value="viewer">
                            <div className="flex items-center gap-2 text-xs">
                              <Eye className="w-3 h-3 text-gray-500" /> Viewer
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0.5 border", getRoleBadge(member.role))}>
                        <span className="flex items-center gap-1">
                          {getRoleIcon(member.role)}
                          {member.role}
                        </span>
                      </Badge>
                    )}
                    {!isCurrentUser && selectedOrg.owner_id === userId && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveMember(member.id, member.user_id)}
                            className="h-6 w-6 p-0 text-gray-500 hover:text-red-400 hover:bg-red-500/10"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Remove member</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Pending Invitations */}
        {selectedOrg && invitations.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 bg-yellow-500 rounded-sm" />
              <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Pending Invitations ({invitations.length})
              </h3>
            </div>
            {invitations.map(inv => (
              <div
                key={inv.id}
                className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-yellow-500/10 flex items-center justify-center flex-shrink-0">
                    <Mail className="w-3.5 h-3.5 text-yellow-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm text-white truncate">{inv.email}</div>
                    <div className="text-[11px] text-gray-500">
                      {inv.role} - expires {new Date(inv.expires_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleResendInvitation(inv.id)}
                        disabled={resendingInvite === inv.id}
                        className="h-6 w-6 p-0 text-gray-400 hover:text-orange-400 hover:bg-orange-500/10"
                      >
                        {resendingInvite === inv.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3 h-3" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Extend invitation (7 days)</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyInviteLink(inv.token)}
                        className="h-6 w-6 p-0 text-gray-400 hover:text-orange-400 hover:bg-orange-500/10"
                      >
                        {copiedToken === inv.token ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copy invite link</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevokeInvitation(inv.id)}
                        className="h-6 w-6 p-0 text-gray-400 hover:text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Revoke invitation</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* GitHub Repo Info */}
        {selectedOrg && isGitHubBacked && githubRepoUrl && (
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 bg-orange-500 rounded-sm" />
                <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">GitHub Repository</h3>
              </div>
              {(currentUserRole === 'owner' || currentUserRole === 'admin') && teamWorkspaceId && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowAddCollaborator(true)}
                  className="h-6 text-[10px] text-gray-400 hover:text-orange-400 hover:bg-orange-500/10 px-2"
                >
                  <GitBranch className="w-3 h-3 mr-1" />
                  Add Collaborator
                </Button>
              )}
            </div>
            <a
              href={githubRepoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-orange-400 hover:text-orange-300 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              {githubRepoUrl.replace('https://github.com/', '')}
            </a>
            {currentUserRole === 'owner' && teamWorkspaceId && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowDeleteWorkspace(true)}
                className="w-full h-7 text-[11px] text-red-400/70 hover:text-red-400 hover:bg-red-500/10 border border-red-500/20 hover:border-red-500/30"
              >
                <Trash2 className="w-3 h-3 mr-1.5" />
                Delete Workspace
              </Button>
            )}
          </div>
        )}

        {/* Create Team Workspace */}
        {selectedOrg && (
          <Button
            size="sm"
            onClick={() => setShowCreateWorkspace(true)}
            className="w-full h-8 text-xs bg-orange-600 hover:bg-orange-500 text-white"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Create Team Workspace
          </Button>
        )}

        {/* Convert current project to team */}
        {selectedOrg && projectId && !isGitHubBacked && (
          <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3">
            <div className="flex items-start gap-2">
              <Activity className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-medium text-orange-300">Shared workspace</div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  Team members with access to this organization can view and edit this project's files in real-time.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Team Dialog */}
      <Dialog open={showCreateOrg} onOpenChange={setShowCreateOrg}>
        <DialogContent className="sm:max-w-[420px] bg-gray-950 border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-orange-400" />
              Create Team
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Create a team to collaborate with others on projects.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm text-gray-300">Team Name</Label>
              <Input
                placeholder="e.g., Acme Engineering"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                className="bg-gray-900 border-gray-700 text-white focus:ring-orange-500/50 focus:border-orange-500/50"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateOrg()
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreateOrg(false)} className="text-gray-400 hover:text-white">
              Cancel
            </Button>
            <Button
              onClick={handleCreateOrg}
              disabled={!newOrgName.trim() || isCreating}
              className="bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-30"
            >
              {isCreating ? (
                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Creating...</>
              ) : (
                <><Plus className="w-4 h-4 mr-1.5" /> Create Team</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Member Dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="sm:max-w-[420px] bg-gray-950 border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-orange-400" />
              Invite Member
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Send an invite link to add someone to {selectedOrg?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm text-gray-300">Email</Label>
              <Input
                type="email"
                placeholder="teammate@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="bg-gray-900 border-gray-700 text-white focus:ring-orange-500/50 focus:border-orange-500/50"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-gray-300">Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <Shield className="w-3.5 h-3.5 text-orange-300" />
                      Admin - Full access + member management
                    </div>
                  </SelectItem>
                  <SelectItem value="editor">
                    <div className="flex items-center gap-2">
                      <Pencil className="w-3.5 h-3.5 text-gray-400" />
                      Editor - Can edit files and chat with AI
                    </div>
                  </SelectItem>
                  <SelectItem value="viewer">
                    <div className="flex items-center gap-2">
                      <Eye className="w-3.5 h-3.5 text-gray-500" />
                      Viewer - Read-only access
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowInvite(false)} className="text-gray-400 hover:text-white">
              Cancel
            </Button>
            <Button
              onClick={handleInvite}
              disabled={!inviteEmail.trim() || isInviting}
              className="bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-30"
            >
              {isInviting ? (
                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Sending...</>
              ) : (
                <><Mail className="w-4 h-4 mr-1.5" /> Send Invite</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Team Workspace Dialog */}
      <Dialog open={showCreateWorkspace} onOpenChange={setShowCreateWorkspace}>
        <DialogContent className="sm:max-w-[480px] bg-gray-950 border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-orange-400" />
              Create Team Workspace
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Create a GitHub-backed workspace for your team. All files will be stored in a GitHub repository.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Mode selector */}
            <div className="flex gap-2">
              <button
                onClick={() => setWsMode("create")}
                className={cn(
                  "flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors border",
                  wsMode === "create"
                    ? "bg-orange-600/15 text-orange-400 border-orange-500/30"
                    : "text-gray-400 border-gray-700 hover:border-gray-600"
                )}
              >
                New Repository
              </button>
              <button
                onClick={() => setWsMode("link")}
                className={cn(
                  "flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors border",
                  wsMode === "link"
                    ? "bg-orange-600/15 text-orange-400 border-orange-500/30"
                    : "text-gray-400 border-gray-700 hover:border-gray-600"
                )}
              >
                Link Existing
              </button>
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-gray-300">Workspace Name</Label>
              <Input
                placeholder="e.g., Landing Page"
                value={wsName}
                onChange={(e) => setWsName(e.target.value)}
                className="bg-gray-900 border-gray-700 text-white focus:ring-orange-500/50 focus:border-orange-500/50"
              />
            </div>

            {wsMode === "create" ? (
              <div className="space-y-2">
                <Label className="text-sm text-gray-300">Repository Name</Label>
                <Input
                  placeholder="e.g., landing-page"
                  value={wsRepoName}
                  onChange={(e) => setWsRepoName(e.target.value.replace(/[^a-zA-Z0-9._-]/g, '-'))}
                  className="bg-gray-900 border-gray-700 text-white focus:ring-orange-500/50 focus:border-orange-500/50"
                />
                <p className="text-[11px] text-gray-500">A new private repo will be created on your GitHub account</p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label className="text-sm text-gray-300">Repository (owner/name)</Label>
                <Input
                  placeholder="e.g., username/my-project"
                  value={wsExistingRepo}
                  onChange={(e) => setWsExistingRepo(e.target.value)}
                  className="bg-gray-900 border-gray-700 text-white focus:ring-orange-500/50 focus:border-orange-500/50"
                />
              </div>
            )}

            {/* GitHub Token Section */}
            <div className="space-y-2">
              <Label className="text-sm text-gray-300">GitHub Connection</Label>

              {loadingCloudToken ? (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-gray-800 bg-gray-900/50">
                  <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
                  <span className="text-xs text-gray-400">Checking GitHub connection...</span>
                </div>
              ) : cloudTokenLoaded ? (
                <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs text-emerald-300 font-medium">GitHub connected via your account settings</span>
                  </div>
                  <button
                    onClick={() => {
                      setCloudTokenLoaded(false)
                      setWsGithubToken("")
                      setShowManualToken(true)
                    }}
                    className="text-[11px] text-gray-500 hover:text-orange-400 mt-1.5 transition-colors"
                  >
                    Use a different token instead
                  </button>
                </div>
              ) : showManualToken ? (
                <>
                  <Input
                    type="password"
                    placeholder="ghp_..."
                    value={wsGithubToken}
                    onChange={(e) => setWsGithubToken(e.target.value)}
                    className="bg-gray-900 border-gray-700 text-white focus:ring-orange-500/50 focus:border-orange-500/50"
                  />
                  <p className="text-[11px] text-gray-500">
                    Needs <code className="text-orange-400/70">repo</code>, <code className="text-orange-400/70">workflow</code>, <code className="text-orange-400/70">delete_repo</code> scopes.
                  </p>
                  <a
                    href="https://github.com/settings/tokens/new?description=PiPilot%20(repo%20workflow)&scopes=repo,workflow,user,delete_repo"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[11px] text-orange-400 hover:text-orange-300 transition-colors"
                  >
                    <Key className="w-3 h-3" />
                    Generate a new token on GitHub
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </>
              ) : (
                <div className="p-3 rounded-lg border border-orange-500/20 bg-orange-500/5 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-medium text-orange-300">No GitHub token found</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        Connect GitHub in your account settings, or enter a token manually.
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href="/workspace/account"
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-orange-600 hover:bg-orange-500 text-white transition-colors"
                    >
                      <Settings className="w-3 h-3" />
                      Account Settings
                    </a>
                    <button
                      onClick={() => setShowManualToken(true)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-300 border border-gray-700 hover:border-gray-600 hover:text-white transition-colors"
                    >
                      <Key className="w-3 h-3" />
                      Enter Token
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreateWorkspace(false)} className="text-gray-400 hover:text-white">
              Cancel
            </Button>
            <Button
              onClick={handleCreateWorkspace}
              disabled={!wsName.trim() || !wsGithubToken.trim() || isCreatingWorkspace || (wsMode === "create" ? !wsRepoName.trim() : !wsExistingRepo.trim())}
              className="bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-30"
            >
              {isCreatingWorkspace ? (
                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Creating...</>
              ) : (
                <><Plus className="w-4 h-4 mr-1.5" /> {wsMode === "create" ? "Create Workspace" : "Link Workspace"}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add GitHub Collaborator Dialog */}
      <Dialog open={showAddCollaborator} onOpenChange={setShowAddCollaborator}>
        <DialogContent className="sm:max-w-[420px] bg-gray-950 border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-orange-400" />
              Add GitHub Collaborator
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Invite a GitHub user to the repository with push access.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm text-gray-300">GitHub Username</Label>
              <Input
                placeholder="e.g., octocat"
                value={collabUsername}
                onChange={(e) => setCollabUsername(e.target.value)}
                className="bg-gray-900 border-gray-700 text-white focus:ring-orange-500/50 focus:border-orange-500/50"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCollaborator()
                }}
              />
              <p className="text-[11px] text-gray-500">
                They'll receive a GitHub invitation to collaborate on the repo.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddCollaborator(false)} className="text-gray-400 hover:text-white">
              Cancel
            </Button>
            <Button
              onClick={handleAddCollaborator}
              disabled={!collabUsername.trim() || isAddingCollab}
              className="bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-30"
            >
              {isAddingCollab ? (
                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Inviting...</>
              ) : (
                <><UserPlus className="w-4 h-4 mr-1.5" /> Add Collaborator</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Workspace Confirmation Dialog */}
      <Dialog open={showDeleteWorkspace} onOpenChange={setShowDeleteWorkspace}>
        <DialogContent className="sm:max-w-[420px] bg-gray-950 border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              Delete Team Workspace
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              This will permanently remove this workspace from PiPilot. Team members will lose access.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {isGitHubBacked && (
              <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-800 bg-gray-900/50 cursor-pointer hover:border-gray-700 transition-colors">
                <input
                  type="checkbox"
                  checked={deleteRepoToo}
                  onChange={(e) => setDeleteRepoToo(e.target.checked)}
                  className="mt-0.5 rounded border-gray-600 bg-gray-800 text-orange-600 focus:ring-orange-500/50"
                />
                <div>
                  <div className="text-sm text-white">Also delete the GitHub repository</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    This cannot be undone. The repo and all its history will be permanently deleted.
                  </div>
                </div>
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDeleteWorkspace(false)} className="text-gray-400 hover:text-white">
              Cancel
            </Button>
            <Button
              onClick={handleDeleteWorkspace}
              disabled={isDeletingWorkspace}
              className="bg-red-500 hover:bg-red-600 text-white disabled:opacity-30"
            >
              {isDeletingWorkspace ? (
                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Deleting...</>
              ) : (
                <><Trash2 className="w-4 h-4 mr-1.5" /> Delete Workspace</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
