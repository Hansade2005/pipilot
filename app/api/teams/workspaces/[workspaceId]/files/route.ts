import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/teams/workspaces/[workspaceId]/files
// List all files in team workspace
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get workspace and verify access
    const { data: workspace, error } = await supabase
      .from('team_workspaces')
      .select('*, organization_id')
      .eq('id', workspaceId)
      .single()

    if (error || !workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    // Check team membership (RLS will handle this, but we verify explicitly)
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

    return NextResponse.json({
      success: true,
      files: workspace.files || []
    })
  } catch (error) {
    console.error('Error fetching files:', error)
    return NextResponse.json(
      { error: 'Failed to fetch files' },
      { status: 500 }
    )
  }
}

// POST /api/teams/workspaces/[workspaceId]/files
// Create new file in team workspace
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const fileData = await request.json()

    // Get current workspace
    const { data: workspace, error: fetchError } = await supabase
      .from('team_workspaces')
      .select('files, organization_id')
      .eq('id', workspaceId)
      .single()

    if (fetchError || !workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    // Check permissions
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

    // Create new file object
    const newFile = {
      id: crypto.randomUUID(),
      path: fileData.path,
      name: fileData.name,
      content: fileData.content || '',
      fileType: fileData.fileType || 'text',
      type: fileData.fileType || 'text',
      size: fileData.size || 0,
      isDirectory: fileData.isDirectory || false,
      workspaceId: workspaceId,
      lastEditedBy: user.id,
      lastEditedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    // Append to files array
    const updatedFiles = [...(workspace.files || []), newFile]

    // Update workspace
    const { error: updateError } = await supabase
      .from('team_workspaces')
      .update({
        files: updatedFiles,
        last_edited_by: user.id,
        last_edited_at: new Date().toISOString()
      })
      .eq('id', workspaceId)

    if (updateError) {
      console.error('Error updating workspace:', updateError)
      return NextResponse.json({ error: 'Failed to create file' }, { status: 500 })
    }

    // Log activity
    await supabase.from('team_activity').insert({
      organization_id: workspace.organization_id,
      workspace_id: workspaceId,
      action: 'file_created',
      actor_id: user.id,
      metadata: {
        file_path: newFile.path,
        file_name: newFile.name
      }
    })

    return NextResponse.json({
      success: true,
      file: newFile
    })
  } catch (error) {
    console.error('Error creating file:', error)
    return NextResponse.json(
      { error: 'Failed to create file' },
      { status: 500 }
    )
  }
}
