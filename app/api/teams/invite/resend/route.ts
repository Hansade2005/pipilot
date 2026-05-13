import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST /api/teams/invite/resend
// Resends/extends a pending team invitation by resetting expires_at to 7 days from now
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { invitationId } = await request.json()

    if (!invitationId) {
      return NextResponse.json({ error: 'invitationId is required' }, { status: 400 })
    }

    const adminSupabase = createAdminClient()

    // 1. Get the invitation, must be pending
    const { data: invitation, error: inviteError } = await adminSupabase
      .from('team_invitations')
      .select('id, organization_id, email, status')
      .eq('id', invitationId)
      .single()

    if (inviteError || !invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
    }

    if (invitation.status !== 'pending') {
      return NextResponse.json({ error: 'Only pending invitations can be resent' }, { status: 400 })
    }

    // 2. Verify user is an active owner or admin of the organization
    const { data: membership } = await adminSupabase
      .from('team_members')
      .select('id, role')
      .eq('organization_id', invitation.organization_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .in('role', ['owner', 'admin'])
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ error: 'You must be an owner or admin to resend invitations' }, { status: 403 })
    }

    // 3. Update expires_at to 7 days from now
    const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const { error: updateError } = await adminSupabase
      .from('team_invitations')
      .update({ expires_at: newExpiry })
      .eq('id', invitationId)

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({ success: true, expires_at: newExpiry })
  } catch (error: any) {
    console.error('Error resending invitation:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
