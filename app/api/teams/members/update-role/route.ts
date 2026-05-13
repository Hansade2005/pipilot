import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { organizationId, memberId, newRole } = await req.json()

    if (!organizationId || !memberId || !newRole) {
      return Response.json({ error: 'Missing organizationId, memberId, or newRole' }, { status: 400 })
    }

    const validRoles = ['admin', 'editor', 'viewer']
    if (!validRoles.includes(newRole)) {
      return Response.json({ error: 'Invalid role. Must be admin, editor, or viewer' }, { status: 400 })
    }

    // Verify the requesting user is an active owner or admin
    const { data: requesterMembership } = await supabase
      .from('team_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!requesterMembership || !['owner', 'admin'].includes(requesterMembership.role)) {
      return Response.json({ error: 'Only owners and admins can change member roles' }, { status: 403 })
    }

    const admin = createAdminClient()

    // Get the target member
    const { data: targetMember } = await admin
      .from('team_members')
      .select('id, user_id, role')
      .eq('id', memberId)
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .single()

    if (!targetMember) {
      return Response.json({ error: 'Member not found' }, { status: 404 })
    }

    // Cannot change own role
    if (targetMember.user_id === user.id) {
      return Response.json({ error: 'Cannot change your own role' }, { status: 403 })
    }

    // Cannot change the org owner's role
    const { data: org } = await admin
      .from('organizations')
      .select('owner_id')
      .eq('id', organizationId)
      .single()

    if (org && targetMember.user_id === org.owner_id) {
      return Response.json({ error: 'Cannot change the organization owner\'s role' }, { status: 403 })
    }

    // Admins can only set editor or viewer (not admin or owner)
    if (requesterMembership.role === 'admin' && !['editor', 'viewer'].includes(newRole)) {
      return Response.json({ error: 'Admins can only assign editor or viewer roles' }, { status: 403 })
    }

    // Update the role
    const { error: updateError } = await admin
      .from('team_members')
      .update({ role: newRole })
      .eq('id', memberId)
      .eq('organization_id', organizationId)

    if (updateError) {
      throw updateError
    }

    return Response.json({ success: true, role: newRole })
  } catch (error: any) {
    console.error('[Update Member Role]', error)
    return Response.json({ error: error.message || 'Failed to update member role' }, { status: 500 })
  }
}
