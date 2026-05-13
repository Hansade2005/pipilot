import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST /api/teams/workspaces/[workspaceId]/sync
// Bulk sync files from local IndexedDB to team workspace
// Body: { files: Array<{ path, name, content, fileType, size, isDirectory }>, deletedPaths?: string[] }
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
    const { files, deletedPaths } = await request.json()

    if (!Array.isArray(files)) {
      return NextResponse.json({ error: 'files array required' }, { status: 400 })
    }

    // If no files to sync and no deletions, return early
    if (files.length === 0 && (!deletedPaths || deletedPaths.length === 0)) {
      return NextResponse.json({ success: true, synced: 0, deleted: 0, totalFiles: 0 })
    }

    // Get workspace + verify membership
    const { data: workspace, error: fetchError } = await supabase
      .from('team_workspaces')
      .select('files, organization_id')
      .eq('id', workspaceId)
      .single()

    if (fetchError || !workspace) {
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

    // Check for locks held by other users on the files being synced
    const filePaths = files.map((f: any) => f.path)
    if (filePaths.length > 0) {
      const { data: locks } = await supabase
        .from('team_file_locks')
        .select('file_path, locked_by')
        .eq('workspace_id', workspaceId)
        .in('file_path', filePaths)
        .gt('expires_at', new Date().toISOString())

      const blockedFiles = (locks || []).filter(l => l.locked_by !== user.id)
      if (blockedFiles.length > 0) {
        return NextResponse.json({
          error: 'Some files are locked by other users',
          blockedFiles: blockedFiles.map(l => l.file_path)
        }, { status: 409 })
      }
    }

    // Build updated files array
    const existingFiles: any[] = workspace.files || []
    const existingByPath = new Map(existingFiles.map(f => [f.path, f]))
    const now = new Date().toISOString()

    // Apply updates/creates
    for (const file of files) {
      const existing = existingByPath.get(file.path)
      if (existing) {
        // Update existing file
        existingByPath.set(file.path, {
          ...existing,
          content: file.content,
          name: file.name,
          fileType: file.fileType || existing.fileType,
          type: file.fileType || existing.type,
          size: file.size || existing.size,
          isDirectory: file.isDirectory || false,
          lastEditedBy: user.id,
          lastEditedAt: now,
          updatedAt: now
        })
      } else {
        // Create new file
        existingByPath.set(file.path, {
          id: crypto.randomUUID(),
          path: file.path,
          name: file.name,
          content: file.content || '',
          fileType: file.fileType || 'text',
          type: file.fileType || 'text',
          size: file.size || 0,
          isDirectory: file.isDirectory || false,
          workspaceId: workspaceId,
          lastEditedBy: user.id,
          lastEditedAt: now,
          createdAt: now,
          updatedAt: now
        })
      }
    }

    // Apply deletes
    if (deletedPaths && Array.isArray(deletedPaths)) {
      for (const path of deletedPaths) {
        existingByPath.delete(path)
      }
    }

    const updatedFiles = Array.from(existingByPath.values())

    // Use admin client for the update to bypass RLS (permissions already verified above)
    const adminSupabase = createAdminClient()

    const { error: updateError } = await adminSupabase
      .from('team_workspaces')
      .update({
        files: updatedFiles,
        last_edited_by: user.id,
        last_edited_at: now
      })
      .eq('id', workspaceId)

    if (updateError) {
      console.error('Sync update error:', JSON.stringify(updateError))
      return NextResponse.json({
        error: 'Failed to sync files',
        details: updateError.message || updateError.code || 'Unknown update error'
      }, { status: 500 })
    }

    // Log activity (don't fail sync if activity logging fails)
    try {
      await adminSupabase.from('team_activity').insert({
        organization_id: workspace.organization_id,
        workspace_id: workspaceId,
        action: 'files_synced',
        actor_id: user.id,
        metadata: {
          file_count: files.length,
          deleted_count: deletedPaths?.length || 0,
          file_paths: filePaths.slice(0, 10)
        }
      })
    } catch {}

    return NextResponse.json({
      success: true,
      synced: files.length,
      deleted: deletedPaths?.length || 0,
      totalFiles: updatedFiles.length
    })
  } catch (error: any) {
    console.error('Error syncing files:', error?.message || error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error?.message || 'Unknown error'
    }, { status: 500 })
  }
}
