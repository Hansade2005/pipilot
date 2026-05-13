import { NextRequest } from 'next/server'
import { Octokit } from '@octokit/rest'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { teamWorkspaceId, githubUsername, permission } = await req.json()

    if (!teamWorkspaceId || !githubUsername) {
      return Response.json({ error: 'Missing teamWorkspaceId or githubUsername' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: workspace } = await admin
      .from('team_workspaces')
      .select('organization_id, github_repo_owner, github_repo_name')
      .eq('id', teamWorkspaceId)
      .single()

    if (!workspace?.github_repo_owner) {
      return Response.json({ error: 'Workspace not linked to GitHub' }, { status: 400 })
    }

    // Verify admin/owner role
    const { data: membership } = await supabase
      .from('team_members')
      .select('role')
      .eq('organization_id', workspace.organization_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return Response.json({ error: 'Only owners and admins can add collaborators' }, { status: 403 })
    }

    // Get GitHub token
    const { data: org } = await admin
      .from('organizations')
      .select('settings')
      .eq('id', workspace.organization_id)
      .single()

    const githubToken = org?.settings?.github_token
    if (!githubToken) {
      return Response.json({ error: 'GitHub token not configured' }, { status: 400 })
    }

    const octokit = new Octokit({ auth: githubToken })

    await octokit.rest.repos.addCollaborator({
      owner: workspace.github_repo_owner,
      repo: workspace.github_repo_name,
      username: githubUsername,
      permission: permission || 'push',
    })

    return Response.json({ success: true })
  } catch (error: any) {
    console.error('[GitHub Add Collaborator]', error)
    return Response.json({ error: error.message || 'Failed to add collaborator' }, { status: 500 })
  }
}
