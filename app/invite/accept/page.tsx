"use client"

import React, { useEffect, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { CheckCircle, XCircle, Loader2, Users, ArrowRight } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { sendTransactionalEmail } from "@/lib/email-client"
import { usePageTitle } from '@/hooks/use-page-title'

interface InvitationData {
  id: string
  email: string
  role: string
  organization: {
    id: string
    name: string
    slug: string
  }
  inviter: {
    name: string
    email: string
  }
}

function AcceptInvitationContent() {
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [invitationData, setInvitationData] = useState<InvitationData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)

  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const { toast } = useToast()

  useEffect(() => {
    if (!token) {
      setError("Invalid invitation link. No token provided.")
      setLoading(false)
      return
    }

    validateInvitation()
  }, [token])

  const validateInvitation = async () => {
    try {
      const supabase = createClient()

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser()

      if (userError || !user) {
        // User not logged in, redirect to login with return URL
        const currentUrl = window.location.href
        router.push(`/auth/login?returnUrl=${encodeURIComponent(currentUrl)}`)
        return
      }

      // Check if invitation exists and is valid
      const { data: invitation, error: inviteError } = await supabase
        .from('team_invitations')
        .select(`
          id,
          email,
          role,
          status,
          expires_at,
          organization:organization_id (
            id,
            name,
            slug
          )
        `)
        .eq('token', token)
        .eq('status', 'pending')
        .single()

      if (inviteError || !invitation) {
        setError("Invalid or expired invitation link.")
        setLoading(false)
        return
      }

      // Check if invitation has expired
      if (new Date(invitation.expires_at) < new Date()) {
        setError("This invitation has expired.")
        setLoading(false)
        return
      }

      // Check if email matches current user
      if (invitation.email.toLowerCase() !== user.email?.toLowerCase()) {
        setError(`This invitation was sent to ${invitation.email}, but you're logged in as ${user.email}. Please log in with the correct account or contact the team administrator.`)
        setLoading(false)
        return
      }

      // Check if user is already a member
      const { data: existingMember } = await supabase
        .from('team_members')
        .select('id')
        .eq('organization_id', (invitation.organization as any)?.id)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single()

      if (existingMember) {
        setError("You're already a member of this team.")
        setLoading(false)
        return
      }

      // Extract organization data
      const organization = invitation.organization as any

      setInvitationData({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        organization: {
          id: organization?.id || '',
          name: organization?.name || '',
          slug: organization?.slug || ''
        },
        inviter: {
          name: 'Team Admin',
          email: ''
        }
      })

      setLoading(false)
    } catch (error) {
      console.error('Error validating invitation:', error)
      setError("Failed to validate invitation. Please try again.")
      setLoading(false)
    }
  }

  const handleAcceptInvitation = async () => {
    if (!invitationData) return

    setAccepting(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        toast({
          title: "Authentication required",
          description: "Please log in to accept the invitation",
          variant: "destructive"
        })
        return
      }

      // Add user to team
      const { error: memberError } = await supabase
        .from('team_members')
        .insert({
          organization_id: invitationData.organization.id,
          user_id: user.id,
          role: invitationData.role,
          status: 'active'
        })

      if (memberError) throw memberError

      // Update invitation status
      const { error: inviteError } = await supabase
        .from('team_invitations')
        .update({ status: 'accepted' })
        .eq('id', invitationData.id)

      if (inviteError) throw inviteError

      // Send welcome email
      try {
        const htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
            <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <h2 style="color: #333; margin-bottom: 20px;">Welcome to ${invitationData.organization.name}!</h2>
              <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                Hi <strong>${user.user_metadata?.full_name || user.email!.split('@')[0]}</strong>,<br><br>
                Welcome to the <strong>${invitationData.organization.name}</strong> team! Your account has been successfully set up and you're now ready to start collaborating.
              </p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://pipilot.dev'}/workspace" style="background-color: #28a745; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Go to Workspace</a>
              </div>
              <p style="color: #666; line-height: 1.6;">
                You can now access your team's workspace, collaborate on projects, and take advantage of all the features available to your team.
              </p>
              <p style="color: #999; font-size: 14px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
                If you have any questions, feel free to reach out to your team administrator.
              </p>
            </div>
          </div>
        `;

        await sendTransactionalEmail({
          to: user.email!,
          subject: `Welcome to ${invitationData.organization.name}!`,
          html: htmlContent,
          text: `Welcome to ${invitationData.organization.name}! Your account is ready. Visit: ${process.env.NEXT_PUBLIC_APP_URL || 'https://pipilot.dev'}/workspace`
        })
      } catch (emailError) {
        console.warn('Welcome email failed to send:', emailError)
        // Don't fail the invitation acceptance if email fails
      }

      // Send notification emails to existing team members
      try {
        // Get existing team members (excluding the new member)
        const { data: existingMembers } = await supabase
          .rpc('get_team_members_with_users', { p_org_id: invitationData.organization.id })

        const teamMemberEmails = (existingMembers || [])
          .filter((m: any) => m.status === 'active' && m.user_id !== user.id && m.email)
          .map((m: any) => m.email)

        if (teamMemberEmails.length > 0) {
          const htmlContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
              <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                <h2 style="color: #333; margin-bottom: 20px;">New Team Member Joined!</h2>
                <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                  Hi there,<br><br>
                  <strong>${user.user_metadata?.full_name || user.email!.split('@')[0]}</strong> has joined <strong>${invitationData.organization.name}</strong> as a new team member.
                </p>
                <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                  Invited by: <strong>${invitationData.inviter.name}</strong>
                </p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://pipilot.dev'}/workspace/teams" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">View Team</a>
                </div>
                <p style="color: #999; font-size: 14px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
                  You can manage team members and permissions from the team settings page.
                </p>
              </div>
            </div>
          `;

          await sendTransactionalEmail({
            to: teamMemberEmails,
            subject: `${user.user_metadata?.full_name || user.email!.split('@')[0]} joined ${invitationData.organization.name}`,
            html: htmlContent,
            text: `${user.user_metadata?.full_name || user.email!.split('@')[0]} has joined ${invitationData.organization.name} as a new team member. Invited by: ${invitationData.inviter.name}`
          })
        }
      } catch (notificationError) {
        console.warn('Team member notification emails failed to send:', notificationError)
        // Don't fail the invitation acceptance if notifications fail
      }

      setAccepted(true)

      toast({
        title: "Welcome to the team!",
        description: `You've successfully joined ${invitationData.organization.name}`
      })

      // Redirect to workspace page after a short delay
      setTimeout(() => {
        router.push('/workspace')
      }, 2000)

    } catch (error: any) {
      console.error('Error accepting invitation:', error)
      toast({
        title: "Failed to join team",
        description: error.message,
        variant: "destructive"
      })
    } finally {
      setAccepting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Validating Invitation</h2>
            <p className="text-gray-600 text-center">Please wait while we verify your invitation...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-pink-100">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center p-8">
            <XCircle className="h-12 w-12 text-red-600 mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Invalid Invitation</h2>
            <p className="text-gray-600 text-center mb-6">{error}</p>
            <Button onClick={() => router.push('/workspace/teams')} variant="outline">
              Go to Teams
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center p-8">
            <CheckCircle className="h-12 w-12 text-green-600 mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Welcome to the Team!</h2>
            <p className="text-gray-600 text-center mb-6">
              You've successfully joined <strong>{invitationData?.organization.name}</strong> as a <strong>{invitationData?.role}</strong>.
            </p>
            <p className="text-sm text-gray-500 mb-6">Redirecting to your teams...</p>
            <Button onClick={() => router.push('/workspace/teams')} className="w-full">
              <ArrowRight className="h-4 w-4 mr-2" />
              Go to Teams
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Users className="h-12 w-12 text-blue-600" />
          </div>
          <CardTitle className="text-2xl">Team Invitation</CardTitle>
          <CardDescription>
            You've been invited to join a team
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center space-y-2">
            <h3 className="text-lg font-semibold text-gray-900">
              {invitationData?.organization.name}
            </h3>
            <p className="text-gray-600">
              Invited by {invitationData?.inviter.name}
            </p>
            <p className="text-sm text-gray-500">
              Role: <span className="font-medium capitalize">{invitationData?.role}</span>
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              By accepting this invitation, you'll be able to collaborate with the team on projects and workspaces.
            </p>
          </div>

          <Button
            onClick={handleAcceptInvitation}
            disabled={accepting}
            className="w-full"
            size="lg"
          >
            {accepting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Joining Team...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Accept Invitation
              </>
            )}
          </Button>

          <Button
            onClick={() => router.push('/workspace/teams')}
            variant="outline"
            className="w-full"
          >
            View My Teams
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default function AcceptInvitationPage() {
  usePageTitle('Accept Invitation')
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading invitation...</p>
        </div>
      </div>
    }>
      <AcceptInvitationContent />
    </Suspense>
  )
}