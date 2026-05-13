import { NextRequest } from 'next/server'
import { Octokit } from '@octokit/rest'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const teamWorkspaceId = searchParams.get('teamWorkspaceId')
    const deleteRepo = searchParams.get('deleteRepo') === 'true'

    if (!teamWorkspaceId) {
      return Response.json({ error: 'Missing teamWorkspaceId' }, { status: 400 })
    }

    const admin = createAdminClient()

    // 1. Get workspace details
    const { data: workspace } = await admin
      .from('team_workspaces')
      .select('organization_id, github_repo_owner, github_repo_name, name')
      .eq('id', teamWorkspaceId)
      .single()

    if (!workspace) {
      return Response.json({ error: 'Workspace not found' }, { status: 404 })
    }

    // 2. Verify user is an active owner of the organization
    const { data: membership } = await supabase
      .from('team_members')
      .select('role')
      .eq('organization_id', workspace.organization_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!membership || membership.role !== 'owner') {
      return Response.json({ error: 'Only owners can delete workspaces' }, { status: 403 })
    }

    // 3. Optionally delete the GitHub repo
    if (deleteRepo && workspace.github_repo_owner && workspace.github_repo_name) {
      const { data: org } = await admin
        .from('organizations')
        .select('settings')
        .eq('id', workspace.organization_id)
        .single()

      const githubToken = org?.settings?.github_token
      if (githubToken) {
        const octokit = new Octokit({ auth: githubToken })
        try {
          await octokit.rest.repos.delete({
            owner: workspace.github_repo_owner,
            repo: workspace.github_repo_name,
          })
        } catch (repoError: any) {
          console.error('[GitHub Delete Repo]', repoError.message)
          // Continue with workspace deletion even if repo deletion fails
        }
      }
    }

    // 4. Delete the workspace from team_workspaces
    const { error: deleteError } = await admin
      .from('team_workspaces')
      .delete()
      .eq('id', teamWorkspaceId)

    if (deleteError) {
      return Response.json({ error: 'Failed to delete workspace' }, { status: 500 })
    }

    // 5. Log activity
    await admin.from('team_activity').insert({
      organization_id: workspace.organization_id,
      user_id: user.id,
      action: 'workspace_deleted',
      metadata: { workspace_name: workspace.name },
    })

    return Response.json({ success: true })
  } catch (error: any) {
    console.error('[GitHub Delete Workspace]', error)
    return Response.json({ error: error.message || 'Failed to delete workspace' }, { status: 500 })
  }
}
