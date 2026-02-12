"use client"

import React, { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"
import {
  Users,
  Plus,
  Settings,
  Mail,
  MoreVertical,
  Crown,
  Shield,
  Edit2,
  Trash2,
  UserPlus,
  Copy,
  CheckCircle,
  ArrowLeft,
  Folder,
  Activity
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { sendTransactionalEmail } from "@/lib/email-client"
import { formatDistanceToNow } from "date-fns"
import { usePageTitle } from '@/hooks/use-page-title'

interface Organization {
  id: string
  name: string
  slug: string
  owner_id: string
  created_at: string
  member_count?: number
  workspace_count?: number
}

interface TeamMember {
  id: string
  user_id: string
  role: string
  status: string
  joined_at: string
  email?: string
  name?: string
  avatar_url?: string
}

interface TeamWorkspace {
  id: string
  name: string
  visibility: string
  created_at: string
  last_edited_at?: string
  file_count?: number
}

export default function TeamsPage() {
  usePageTitle('Teams')
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [teamWorkspaces, setTeamWorkspaces] = useState<TeamWorkspace[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("editor")
  const [inviteLink, setInviteLink] = useState("")
  const [showCreateOrgDialog, setShowCreateOrgDialog] = useState(false)
  const [newOrgName, setNewOrgName] = useState("")
  const { toast } = useToast()
  const router = useRouter()

  useEffect(() => {
    fetchOrganizations()
  }, [])

  useEffect(() => {
    if (selectedOrg) {
      fetchTeamMembers()
      fetchTeamWorkspaces()
    }
  }, [selectedOrg])

  // Real-time subscriptions for live updates
  useEffect(() => {
    if (!currentUserId) return

    const supabase = createClient()

    // Subscribe to team member changes to update member counts
    const memberChannel = supabase
      .channel('team_members_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_members'
        },
        async (payload) => {
          console.log('Teams page: Team member change detected:', payload)
          // Refresh organization data to update counts
          await fetchOrganizations()
          
          // If the selected org was affected, refresh its data
          if (selectedOrg && (payload.new as any)?.organization_id === selectedOrg.id) {
            fetchTeamMembers()
          }
        }
      )
      .subscribe()

    // Subscribe to team workspace changes to update workspace counts
    const workspaceChannel = supabase
      .channel('team_workspaces_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_workspaces'
        },
        async (payload) => {
          console.log('Teams page: Team workspace change detected:', payload)
          // Refresh organization data to update counts
          await fetchOrganizations()
          
          // If the selected org was affected, refresh its workspace data
          if (selectedOrg && (payload.new as any)?.organization_id === selectedOrg.id) {
            fetchTeamWorkspaces()
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(memberChannel)
      supabase.removeChannel(workspaceChannel)
    }
  }, [currentUserId, selectedOrg])

  const fetchOrganizations = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/auth/login')
        return
      }

      setCurrentUserId(user.id)

      // Fetch organizations where user is a member
      const { data: memberships, error } = await supabase
        .from('team_members')
        .select(`
          organization_id,
          role,
          organization:organization_id (
            id,
            name,
            slug,
            owner_id,
            created_at
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'active')

      if (error) throw error

      const orgs = (memberships || [])
        .filter(m => m.organization)
        .map(m => m.organization as any as Organization)

      // Fetch counts for each org
      for (const org of orgs) {
        // Count members
        const { count: memberCount } = await supabase
          .from('team_members')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', org.id)
          .eq('status', 'active')

        // Count workspaces
        const { count: workspaceCount } = await supabase
          .from('team_workspaces')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', org.id)

        org.member_count = memberCount || 0
        org.workspace_count = workspaceCount || 0
      }

      setOrganizations(orgs)
      if (orgs.length > 0 && !selectedOrg) {
        setSelectedOrg(orgs[0])
      }
      setLoading(false)
    } catch (error) {
      console.error('Error fetching organizations:', error)
      toast({
        title: "Error loading teams",
        description: "Failed to fetch your organizations",
        variant: "destructive"
      })
      setLoading(false)
    }
  }

  const fetchTeamMembers = async () => {
    if (!selectedOrg) return

    try {
      const supabase = createClient()

      // Use the RPC function that securely joins with auth.users
      const { data, error } = await supabase
        .rpc('get_team_members_with_users', { p_org_id: selectedOrg.id })

      if (error) throw error

      // Filter for active members and map the data
      const members: TeamMember[] = (data || [])
        .filter((m: any) => m.status === 'active')
        .map((m: any) => ({
          id: m.id,
          user_id: m.user_id,
          role: m.role,
          status: m.status,
          joined_at: m.created_at,
          email: m.email,
          name: m.raw_user_meta_data?.full_name || m.email?.split('@')[0],
          avatar_url: m.raw_user_meta_data?.avatar_url
        }))

      setTeamMembers(members)
    } catch (error) {
      console.error('Error fetching team members:', error)
    }
  }

  const fetchTeamWorkspaces = async () => {
    if (!selectedOrg) return

    try {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('team_workspaces')
        .select('*')
        .eq('organization_id', selectedOrg.id)
        .order('created_at', { ascending: false })

      if (error) throw error

      const workspaces: TeamWorkspace[] = (data || []).map((w: any) => ({
        id: w.id,
        name: w.name,
        visibility: w.visibility,
        created_at: w.created_at,
        last_edited_at: w.last_edited_at,
        file_count: Array.isArray(w.files) ? w.files.length : 0
      }))

      setTeamWorkspaces(workspaces)
    } catch (error) {
      console.error('Error fetching workspaces:', error)
    }
  }

  const handleCreateOrg = async () => {
    if (!newOrgName.trim()) {
      toast({
        title: "Name required",
        description: "Please enter an organization name",
        variant: "destructive"
      })
      return
    }

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) throw new Error("Not authenticated")

      const slug = newOrgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({
          name: newOrgName.trim(),
          slug,
          owner_id: user.id
        })
        .select()
        .single()

      if (orgError) throw orgError

      const { error: memberError } = await supabase
        .from('team_members')
        .insert({
          organization_id: org.id,
          user_id: user.id,
          role: 'owner',
          status: 'active'
        })

      if (memberError) throw memberError

      toast({
        title: "Organization created",
        description: `${newOrgName} has been created successfully`
      })

      setShowCreateOrgDialog(false)
      setNewOrgName("")
      fetchOrganizations()
    } catch (error: any) {
      console.error('Error creating organization:', error)
      toast({
        title: "Failed to create organization",
        description: error.message,
        variant: "destructive"
      })
    }
  }

  const handleInviteMember = async () => {
    if (!inviteEmail.trim() || !selectedOrg) {
      toast({
        title: "Email required",
        description: "Please enter an email address",
        variant: "destructive"
      })
      return
    }

    try {
      const supabase = createClient()

      // Generate a secure token for the invitation
      const token = crypto.randomUUID()

      // Get current user info for the invitation
      const { data: userData } = await supabase.auth.getUser()
      const currentUser = userData.user

      // Create invitation with all required fields
      const { data, error } = await supabase
        .from('team_invitations')
        .insert({
          organization_id: selectedOrg.id,
          email: inviteEmail.trim(),
          role: inviteRole,
          status: 'pending',
          token: token,
          invited_by: currentUser?.id,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days from now
        })
        .select()
        .single()

      if (error) throw error

      // Send invitation email
      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pipilot.dev';
        const acceptUrl = `${baseUrl}/invite/accept?token=${token}`;
        
        const htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
            <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <h2 style="color: #333; margin-bottom: 20px;">You're invited to join ${selectedOrg.name}</h2>
              <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                Hi there,<br><br>
                <strong>${currentUser?.user_metadata?.full_name || currentUser?.email?.split('@')[0] || 'Team Admin'}</strong> has invited you to join the <strong>${selectedOrg.name}</strong> team as a <strong>${inviteRole}</strong>.
              </p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${acceptUrl}" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Accept Invitation</a>
              </div>
              <p style="color: #999; font-size: 14px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${acceptUrl}" style="color: #007bff; word-break: break-all;">${acceptUrl}</a>
              </p>
              <p style="color: #999; font-size: 12px; margin-top: 20px;">
                This invitation will expire in 7 days.
              </p>
            </div>
          </div>
        `;

        const emailResult = await sendTransactionalEmail({
          to: inviteEmail.trim(),
          subject: `You're invited to join ${selectedOrg.name}`,
          html: htmlContent,
          text: `You're invited to join ${selectedOrg.name}. Click here to accept: ${acceptUrl}`
        })

        if (emailResult.success) {
          toast({
            title: "Invitation sent",
            description: `Invitation email sent to ${inviteEmail}`
          })
        } else {
          console.warn('Database invitation created but email failed:', emailResult.error)
          toast({
            title: "Invitation created",
            description: `Invitation saved but email failed to send: ${emailResult.error}`,
            variant: "destructive"
          })
        }
      } catch (emailError) {
        console.warn('Email sending failed:', emailError)
        toast({
          title: "Invitation created",
          description: `Invitation saved but email failed to send. User can still accept via direct link.`,
        })
      }

      setShowInviteDialog(false)
      setInviteEmail("")
    } catch (error: any) {
      console.error('Error sending invitation:', error)
      toast({
        title: "Failed to send invitation",
        description: error.message,
        variant: "destructive"
      })
    }
  }

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!confirm(`Remove ${memberName} from the team?`)) return

    try {
      const supabase = createClient()

      const { error } = await supabase
        .from('team_members')
        .update({ status: 'removed' })
        .eq('id', memberId)

      if (error) throw error

      toast({
        title: "Member removed",
        description: `${memberName} has been removed from the team`
      })

      fetchTeamMembers()
    } catch (error: any) {
      console.error('Error removing member:', error)
      toast({
        title: "Failed to remove member",
        description: error.message,
        variant: "destructive"
      })
    }
  }

  const handleChangeRole = async (memberId: string, newRole: string) => {
    try {
      const supabase = createClient()

      const { error } = await supabase
        .from('team_members')
        .update({ role: newRole })
        .eq('id', memberId)

      if (error) throw error

      toast({
        title: "Role updated",
        description: `Member role changed to ${newRole}`
      })

      fetchTeamMembers()
    } catch (error: any) {
      console.error('Error updating role:', error)
      toast({
        title: "Failed to update role",
        description: error.message,
        variant: "destructive"
      })
    }
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'owner':
        return <Badge className="bg-purple-500"><Crown className="h-3 w-3 mr-1" />Owner</Badge>
      case 'admin':
        return <Badge className="bg-blue-500"><Shield className="h-3 w-3 mr-1" />Admin</Badge>
      case 'editor':
        return <Badge variant="secondary"><Edit2 className="h-3 w-3 mr-1" />Editor</Badge>
      case 'viewer':
        return <Badge variant="outline">Viewer</Badge>
      default:
        return <Badge variant="outline">{role}</Badge>
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/workspace')}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Workspace
              </Button>
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Users className="h-6 w-6" />
                  Team Management
                </h1>
                <p className="text-sm text-muted-foreground">
                  Manage your teams, members, and workspaces
                </p>
              </div>
            </div>
            <Button onClick={() => setShowCreateOrgDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Organization
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Organizations Sidebar */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Your Organizations</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[calc(100vh-300px)]">
                  {organizations.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No organizations yet</p>
                    </div>
                  ) : (
                    <div className="space-y-1 p-2">
                      {organizations.map((org) => (
                        <Button
                          key={org.id}
                          variant={selectedOrg?.id === org.id ? "secondary" : "ghost"}
                          className="w-full justify-start h-auto p-3"
                          onClick={() => setSelectedOrg(org)}
                        >
                          <div className="flex-1 text-left">
                            <div className="font-medium text-sm">{org.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {org.member_count} members · {org.workspace_count} workspaces
                            </div>
                          </div>
                        </Button>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {selectedOrg ? (
              <Tabs defaultValue="members" className="space-y-4">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="members">
                    <Users className="h-4 w-4 mr-2" />
                    Members
                  </TabsTrigger>
                  <TabsTrigger value="workspaces">
                    <Folder className="h-4 w-4 mr-2" />
                    Workspaces
                  </TabsTrigger>
                  <TabsTrigger value="settings">
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
                  </TabsTrigger>
                </TabsList>

                {/* Members Tab */}
                <TabsContent value="members" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle>{selectedOrg.name} Members</CardTitle>
                          <CardDescription>
                            Manage team members and their permissions
                          </CardDescription>
                        </div>
                        <Button onClick={() => setShowInviteDialog(true)}>
                          <UserPlus className="h-4 w-4 mr-2" />
                          Invite Member
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {teamMembers.map((member) => (
                          <div
                            key={member.id}
                            className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <Avatar>
                                <AvatarImage src={member.avatar_url} />
                                <AvatarFallback className="bg-gradient-to-br from-blue-400 to-purple-400 text-white">
                                  {(member.name || member.email || 'U').charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="font-medium">{member.name || member.email}</div>
                                <div className="text-sm text-muted-foreground">
                                  {member.email}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Joined {formatDistanceToNow(new Date(member.joined_at), { addSuffix: true })}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {getRoleBadge(member.role)}
                              {member.user_id !== currentUserId && member.role !== 'owner' && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm">
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => handleChangeRole(member.id, 'admin')}>
                                      Change to Admin
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleChangeRole(member.id, 'editor')}>
                                      Change to Editor
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleChangeRole(member.id, 'viewer')}>
                                      Change to Viewer
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => handleRemoveMember(member.id, member.name || member.email || 'member')}
                                      className="text-destructive"
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Remove Member
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Workspaces Tab */}
                <TabsContent value="workspaces" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Team Workspaces</CardTitle>
                      <CardDescription>
                        All collaborative workspaces in {selectedOrg.name}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {teamWorkspaces.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <Folder className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p className="text-sm font-medium">No team workspaces yet</p>
                          <p className="text-xs mt-1">Convert a personal workspace or create a new one</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {teamWorkspaces.map((workspace) => (
                            <div
                              key={workspace.id}
                              className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors cursor-pointer"
                              onClick={() => router.push(`/workspace`)}
                            >
                              <div className="flex items-center gap-3">
                                <Folder className="h-5 w-5 text-blue-500" />
                                <div>
                                  <div className="font-medium">{workspace.name}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {workspace.file_count} files · Last edited {workspace.last_edited_at ? formatDistanceToNow(new Date(workspace.last_edited_at), { addSuffix: true }) : 'never'}
                                  </div>
                                </div>
                              </div>
                              <Badge variant="secondary">{workspace.visibility}</Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Settings Tab */}
                <TabsContent value="settings" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Organization Settings</CardTitle>
                      <CardDescription>
                        Manage {selectedOrg.name} settings
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <Label>Organization Name</Label>
                        <Input value={selectedOrg.name} disabled />
                      </div>
                      <div>
                        <Label>Organization Slug</Label>
                        <Input value={selectedOrg.slug} disabled />
                      </div>
                      <div>
                        <Label>Created</Label>
                        <Input value={formatDistanceToNow(new Date(selectedOrg.created_at), { addSuffix: true })} disabled />
                      </div>
                      <div className="pt-4">
                        <Button variant="destructive" disabled>
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Organization (Coming Soon)
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            ) : (
              <Card>
                <CardContent className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <Users className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-semibold mb-2">No organization selected</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Select an organization or create a new one to get started
                    </p>
                    <Button onClick={() => setShowCreateOrgDialog(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Organization
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Create Organization Dialog */}
      <Dialog open={showCreateOrgDialog} onOpenChange={setShowCreateOrgDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Organization</DialogTitle>
            <DialogDescription>
              Create a new organization to manage your team workspaces
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="org-name">Organization Name</Label>
              <Input
                id="org-name"
                placeholder="e.g., Acme Inc"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateOrgDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateOrg} disabled={!newOrgName.trim()}>
              Create Organization
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Member Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
            <DialogDescription>
              Send an invitation to join {selectedOrg?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="colleague@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="role">Role</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    {inviteRole.charAt(0).toUpperCase() + inviteRole.slice(1)}
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-full">
                  <DropdownMenuItem onClick={() => setInviteRole('admin')}>
                    Admin - Full access
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setInviteRole('editor')}>
                    Editor - Can edit workspaces
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setInviteRole('viewer')}>
                    Viewer - Read-only access
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInviteDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleInviteMember}>
              <Mail className="h-4 w-4 mr-2" />
              Send Invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
