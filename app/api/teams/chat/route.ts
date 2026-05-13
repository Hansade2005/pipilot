import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/teams/chat?workspaceId=xxx
// Returns all shared chat sessions for a team workspace with author profile info
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspaceId')

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'workspaceId is required' },
        { status: 400 }
      )
    }

    // Get workspace to find the organization
    const { data: workspace, error: workspaceError } = await supabase
      .from('team_workspaces')
      .select('id, organization_id')
      .eq('id', workspaceId)
      .single()

    if (workspaceError || !workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      )
    }

    // Verify user is a team member
    const { data: member } = await supabase
      .from('team_members')
      .select('role')
      .eq('organization_id', workspace.organization_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!member) {
      return NextResponse.json(
        { error: 'You are not a member of this team' },
        { status: 403 }
      )
    }

    // Fetch shared chats with author profile info
    const { data: chats, error: chatsError } = await supabase
      .from('team_shared_chats')
      .select(`
        id,
        workspace_id,
        project_id,
        title,
        messages,
        shared_by,
        created_at,
        updated_at,
        profiles:shared_by (
          id,
          full_name,
          avatar_url,
          email
        )
      `)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })

    if (chatsError) {
      console.error('Error fetching shared chats:', chatsError)
      return NextResponse.json(
        { error: 'Failed to fetch shared chats' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      chats: chats || [],
      total: chats?.length || 0
    })
  } catch (error) {
    console.error('Error in teams chat GET:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/teams/chat
// Shares a chat session to the team workspace
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { workspaceId, title, messages, projectId } = body

    if (!workspaceId || !title || !messages) {
      return NextResponse.json(
        { error: 'workspaceId, title, and messages are required' },
        { status: 400 }
      )
    }

    // Get workspace to find the organization
    const { data: workspace, error: workspaceError } = await supabase
      .from('team_workspaces')
      .select('id, organization_id')
      .eq('id', workspaceId)
      .single()

    if (workspaceError || !workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      )
    }

    // Verify membership and role (owner, admin, or editor can share)
    const { data: member } = await supabase
      .from('team_members')
      .select('role')
      .eq('organization_id', workspace.organization_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!member) {
      return NextResponse.json(
        { error: 'You are not a member of this team' },
        { status: 403 }
      )
    }

    if (!['owner', 'admin', 'editor'].includes(member.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions. Only owners, admins, and editors can share chats.' },
        { status: 403 }
      )
    }

    // Insert into team_shared_chats
    const { data: chat, error: insertError } = await supabase
      .from('team_shared_chats')
      .insert({
        workspace_id: workspaceId,
        organization_id: workspace.organization_id,
        project_id: projectId || null,
        title,
        messages,
        shared_by: user.id,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error sharing chat:', insertError)
      return NextResponse.json(
        { error: 'Failed to share chat' },
        { status: 500 }
      )
    }

    return NextResponse.json({ chat }, { status: 201 })
  } catch (error) {
    console.error('Error in teams chat POST:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
