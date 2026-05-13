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

    const { organizationId, workspaceName, githubToken, repoFullName } = await req.json()

    if (!organizationId || !workspaceName || !githubToken || !repoFullName) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify membership
    const { data: membership } = await supabase
      .from('team_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return Response.json({ error: 'Only owners and admins can link workspaces' }, { status: 403 })
    }

    const [owner, repoName] = repoFullName.split('/')
    if (!owner || !repoName) {
      return Response.json({ error: 'Invalid repo format. Use owner/repo-name' }, { status: 400 })
    }

    // Verify repo access
    const octokit = new Octokit({ auth: githubToken })
    const { data: repo } = await octokit.rest.repos.get({ owner, repo: repoName })

    // Get HEAD SHA
    const { data: ref } = await octokit.rest.git.getRef({
      owner,
      repo: repoName,
      ref: `heads/${repo.default_branch}`,
    })

    // Create workspace row
    const admin = createAdminClient()
    const { data: workspace, error: wsError } = await admin
      .from('team_workspaces')
      .insert({
        organization_id: organizationId,
        name: workspaceName,
        created_by: user.id,
        visibility: 'team',
        github_repo_owner: owner,
        github_repo_name: repoName,
        github_repo_url: repo.html_url,
        github_default_branch: repo.default_branch,
        github_last_synced_sha: ref.object.sha,
        files: [],
      })
      .select()
      .single()

    if (wsError) throw wsError

    // Store token in org settings
    const { data: orgData } = await admin
      .from('organizations')
      .select('settings')
      .eq('id', organizationId)
      .single()

    await admin
      .from('organizations')
      .update({
        settings: {
          ...orgData?.settings,
          github_token: githubToken,
          github_username: owner,
        },
      })
      .eq('id', organizationId)

    // Log activity
    await admin.from('team_activity').insert({
      organization_id: organizationId,
      workspace_id: workspace.id,
      action: 'workspace_linked',
      actor_id: user.id,
      metadata: {
        workspace_name: workspaceName,
        github_repo: repo.full_name,
      },
    })

    return Response.json({
      workspace,
      repoUrl: repo.html_url,
      repoFullName: repo.full_name,
    })
  } catch (error: any) {
    console.error('[GitHub Link Workspace]', error)
    return Response.json({ error: error.message || 'Failed to link workspace' }, { status: 500 })
  }
}
