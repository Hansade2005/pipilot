import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST /api/teams/invite
// Creates an invitation and sends in-app notification (if user exists) or email (if not)
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { organizationId, email, role } = await request.json()

    if (!organizationId || !email || !role) {
      return NextResponse.json({ error: 'organizationId, email, and role are required' }, { status: 400 })
    }

    // Verify the inviter is admin/owner of the org
    const { data: org } = await supabase
      .from('organizations')
      .select('id, name, max_members, owner_id')
      .eq('id', organizationId)
      .single()

    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Check member limit
    const adminSupabase = createAdminClient()
    const { count: memberCount } = await adminSupabase
      .from('team_members')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'active')

    if ((memberCount || 0) >= (org.max_members || 5)) {
      return NextResponse.json({ error: `Team limit reached (${org.max_members || 5} members)` }, { status: 400 })
    }

    // Check if already a member (look up user in profiles first)
    const { data: profileCheck } = await adminSupabase
      .from('profiles')
      .select('id')
      .eq('email', email.trim())
      .maybeSingle()

    if (profileCheck) {
      const { data: existingMember } = await adminSupabase
        .from('team_members')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('user_id', profileCheck.id)
        .eq('status', 'active')
        .maybeSingle()

      if (existingMember) {
        return NextResponse.json({ error: 'This user is already a team member' }, { status: 409 })
      }
    }

    // Create invitation
    const token = crypto.randomUUID()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    const { error: inviteError } = await supabase
      .from('team_invitations')
      .insert({
        organization_id: organizationId,
        email: email.trim(),
        role,
        token,
        invited_by: user.id,
        expires_at: expiresAt.toISOString(),
      })

    if (inviteError) {
      if (inviteError.code === '23505') {
        return NextResponse.json({ error: 'An invitation already exists for this email' }, { status: 409 })
      }
      throw inviteError
    }

    const inviteUrl = `${request.nextUrl.origin}/invite/${token}`
    const inviterName = user.user_metadata?.full_name || user.email || 'A team member'

    // Check if the invited user exists in our system via profiles table
    const { data: invitedUser } = await adminSupabase
      .from('profiles')
      .select('id, email, full_name')
      .eq('email', email.trim())
      .maybeSingle()

    // Always send invitation email (for both existing and new users)
    const emailHtml = buildInvitationEmail(inviterName, org.name, role, inviteUrl)
    let emailSent = false

    try {
      const emailResponse = await fetch(`${request.nextUrl.origin}/api/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email.trim(),
          subject: `You're invited to join ${org.name} on PiPilot`,
          html: emailHtml,
          from: 'hello@pipilot.dev',
        }),
      })
      emailSent = emailResponse.ok
    } catch (emailError) {
      console.error('Failed to send invitation email:', emailError)
    }

    if (invitedUser) {
      // User exists — also send in-app notification
      const { error: notifError } = await adminSupabase
        .from('user_notifications')
        .insert({
          user_id: invitedUser.id,
          title: `Team Invitation: ${org.name}`,
          message: `${inviterName} invited you to join "${org.name}" as ${role}. Click to accept the invitation.`,
          type: 'info',
          url: inviteUrl,
          image_url: 'https://pipilot.dev/icons/icon-192x192.png',
          priority: 4,
          is_read: false,
        })

      if (notifError) {
        console.error('Failed to insert notification:', notifError)
      }

      return NextResponse.json({
        success: true,
        method: 'both',
        notificationSent: !notifError,
        emailSent,
        token,
        inviteUrl,
      })
    } else {
      return NextResponse.json({
        success: true,
        method: emailSent ? 'email' : 'email_failed',
        emailSent,
        token,
        inviteUrl,
      })
    }
  } catch (error: any) {
    console.error('Error creating invitation:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

function buildInvitationEmail(
  inviterName: string,
  orgName: string,
  role: string,
  inviteUrl: string
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0f;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#111118;border-radius:16px;border:1px solid #1e1e2e;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#ea580c 0%,#f97316 100%);padding:32px 40px;text-align:center;">
              <img src="https://pipilot.dev/icons/icon-192x192.png" alt="PiPilot" width="48" height="48" style="border-radius:12px;margin-bottom:12px;" />
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">
                You're Invited!
              </h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#d1d5db;">
                Hi there,
              </p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#d1d5db;">
                <strong style="color:#f97316;">${inviterName}</strong> has invited you to join
                <strong style="color:#ffffff;">${orgName}</strong> on PiPilot as a
                <strong style="color:#ffffff;">${role}</strong>.
              </p>
              <!-- Info Card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#1a1a2e;border-radius:12px;border:1px solid #2a2a3e;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Team Details</p>
                    <p style="margin:0 0 4px;font-size:15px;color:#ffffff;font-weight:600;">${orgName}</p>
                    <p style="margin:0;font-size:13px;color:#9ca3af;">Role: ${role.charAt(0).toUpperCase() + role.slice(1)} &bull; Expires in 7 days</p>
                  </td>
                </tr>
              </table>
              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${inviteUrl}" style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,#ea580c,#f97316);color:#ffffff;text-decoration:none;border-radius:12px;font-size:15px;font-weight:600;letter-spacing:0.2px;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#6b7280;text-align:center;">
                Don't have a PiPilot account? No worries &mdash; you'll be able to sign up when you accept.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #1e1e2e;text-align:center;">
              <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">
                PiPilot &mdash; Canada's Agentic Vibe Coding Platform
              </p>
              <p style="margin:0;font-size:12px;color:#4b5563;">
                If you didn't expect this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
