import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/teams/file-locks?workspaceId=xxx
// Returns all active file locks for a team workspace
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspaceId')

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }

    // Get workspace and verify team membership
    const { data: workspace } = await supabase
      .from('team_workspaces')
      .select('organization_id')
      .eq('id', workspaceId)
      .single()

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    const { data: member } = await supabase
      .from('team_members')
      .select('role')
      .eq('organization_id', workspace.organization_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Not a team member' }, { status: 403 })
    }

    // Get active (non-expired) locks
    const { data: locks, error } = await supabase
      .from('team_file_locks')
      .select('id, file_path, locked_by, locked_at, expires_at')
      .eq('workspace_id', workspaceId)
      .gt('expires_at', new Date().toISOString())

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Get profile info for lock holders
    const userIds = [...new Set((locks || []).map(l => l.locked_by))]
    let profiles: Record<string, any> = {}

    if (userIds.length > 0) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, email, full_name, avatar_url')
        .in('id', userIds)

      if (profileData) {
        profiles = Object.fromEntries(profileData.map(p => [p.id, p]))
      }
    }

    const enrichedLocks = (locks || []).map(lock => ({
      ...lock,
      user: profiles[lock.locked_by] || { id: lock.locked_by }
    }))

    return NextResponse.json({ locks: enrichedLocks })
  } catch (error) {
    console.error('Error fetching file locks:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/teams/file-locks
// Acquire a file lock
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { workspaceId, filePath } = await request.json()

    if (!workspaceId || !filePath) {
      return NextResponse.json({ error: 'workspaceId and filePath required' }, { status: 400 })
    }

    // Verify membership
    const { data: workspace } = await supabase
      .from('team_workspaces')
      .select('organization_id')
      .eq('id', workspaceId)
      .single()

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    const { data: member } = await supabase
      .from('team_members')
      .select('role')
      .eq('organization_id', workspace.organization_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!member || !['owner', 'admin', 'editor'].includes(member.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Clean up expired locks first
    await supabase
      .from('team_file_locks')
      .delete()
      .eq('workspace_id', workspaceId)
      .lt('expires_at', new Date().toISOString())

    // Try to acquire lock (upsert - if we already own it, refresh it)
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

    const { data: existingLock } = await supabase
      .from('team_file_locks')
      .select('id, locked_by')
      .eq('workspace_id', workspaceId)
      .eq('file_path', filePath)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (existingLock && existingLock.locked_by !== user.id) {
      // Someone else holds the lock
      const { data: lockHolder } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', existingLock.locked_by)
        .single()

      return NextResponse.json({
        error: 'File is locked',
        lockedBy: lockHolder?.full_name || lockHolder?.email || 'another user'
      }, { status: 409 })
    }

    if (existingLock && existingLock.locked_by === user.id) {
      // Refresh our own lock
      await supabase
        .from('team_file_locks')
        .update({ expires_at: expiresAt, locked_at: new Date().toISOString() })
        .eq('id', existingLock.id)

      return NextResponse.json({ success: true, action: 'refreshed' })
    }

    // Create new lock
    const { error: insertError } = await supabase
      .from('team_file_locks')
      .insert({
        workspace_id: workspaceId,
        file_path: filePath,
        locked_by: user.id,
        expires_at: expiresAt
      })

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json({ error: 'File is already locked' }, { status: 409 })
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, action: 'acquired' })
  } catch (error) {
    console.error('Error acquiring file lock:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/teams/file-locks?workspaceId=xxx&filePath=yyy
// Release a file lock
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspaceId')
    const filePath = searchParams.get('filePath')

    if (!workspaceId || !filePath) {
      return NextResponse.json({ error: 'workspaceId and filePath required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('team_file_locks')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('file_path', filePath)
      .eq('locked_by', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error releasing file lock:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
