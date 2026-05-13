import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// PATCH /api/teams/workspaces/[workspaceId]/files/[fileId]
// Update file content
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; fileId: string }> }
) {
  const { workspaceId, fileId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const updates = await request.json()

    // Get workspace
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

    // Find and update file in array
    const files = workspace.files || []
    const fileIndex = files.findIndex((f: any) => f.id === fileId)

    if (fileIndex === -1) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    // Update file
    files[fileIndex] = {
      ...files[fileIndex],
      ...updates,
      lastEditedBy: user.id,
      lastEditedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    // Ensure fileType and type are synced
    if (updates.fileType) {
      files[fileIndex].type = updates.fileType
    }
    if (updates.type) {
      files[fileIndex].fileType = updates.type
    }

    // Save back to database using admin client (permissions already verified above)
    const adminSupabase = createAdminClient()

    const { error: updateError } = await adminSupabase
      .from('team_workspaces')
      .update({
        files: files,
        last_edited_by: user.id,
        last_edited_at: new Date().toISOString()
      })
      .eq('id', workspaceId)

    if (updateError) {
      console.error('Error updating file:', updateError)
      return NextResponse.json({ error: 'Failed to update file' }, { status: 500 })
    }

    // Log activity
    await adminSupabase.from('team_activity').insert({
      organization_id: workspace.organization_id,
      workspace_id: workspaceId,
      action: 'file_updated',
      actor_id: user.id,
      metadata: {
        file_id: fileId,
        file_path: files[fileIndex].path
      }
    })

    return NextResponse.json({
      success: true,
      file: files[fileIndex]
    })
  } catch (error) {
    console.error('Error updating file:', error)
    return NextResponse.json(
      { error: 'Failed to update file' },
      { status: 500 }
    )
  }
}

// DELETE /api/teams/workspaces/[workspaceId]/files/[fileId]
// Delete file from team workspace
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; fileId: string }> }
) {
  const { workspaceId, fileId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get workspace
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

    // Find the file to log it before deletion
    const files = workspace.files || []
    const fileToDelete = files.find((f: any) => f.id === fileId)

    if (!fileToDelete) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    // Filter out the file
    const updatedFiles = files.filter((f: any) => f.id !== fileId)

    // Save back using admin client (permissions already verified above)
    const adminSupabase = createAdminClient()

    const { error: updateError } = await adminSupabase
      .from('team_workspaces')
      .update({
        files: updatedFiles,
        last_edited_by: user.id,
        last_edited_at: new Date().toISOString()
      })
      .eq('id', workspaceId)

    if (updateError) {
      console.error('Error deleting file:', updateError)
      return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 })
    }

    // Log activity
    await adminSupabase.from('team_activity').insert({
      organization_id: workspace.organization_id,
      workspace_id: workspaceId,
      action: 'file_deleted',
      actor_id: user.id,
      metadata: {
        file_id: fileId,
        file_path: fileToDelete.path,
        file_name: fileToDelete.name
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting file:', error)
    return NextResponse.json(
      { error: 'Failed to delete file' },
      { status: 500 }
    )
  }
}
