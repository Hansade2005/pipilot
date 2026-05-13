import { NextRequest } from 'next/server'
import { Octokit } from '@octokit/rest'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const teamWorkspaceId = searchParams.get('teamWorkspaceId')
    const sha = searchParams.get('sha')

    if (!teamWorkspaceId || !sha) {
      return Response.json({ error: 'Missing teamWorkspaceId or sha' }, { status: 400 })
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

    // Verify membership
    const { data: membership } = await supabase
      .from('team_members')
      .select('role')
      .eq('organization_id', workspace.organization_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!membership) {
      return Response.json({ error: 'Not a member' }, { status: 403 })
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

    const { data: commit } = await octokit.rest.repos.getCommit({
      owner: workspace.github_repo_owner,
      repo: workspace.github_repo_name,
      ref: sha,
    })

    return Response.json({
      sha: commit.sha,
      message: commit.commit.message,
      author_name: commit.commit.author?.name || commit.author?.login || 'Unknown',
      author_email: commit.commit.author?.email || '',
      date: commit.commit.author?.date || '',
      stats: commit.stats || { additions: 0, deletions: 0, total: 0 },
      files: (commit.files || []).map(f => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch?.slice(0, 2000),
      })),
    })
  } catch (error: any) {
    console.error('[GitHub Commit Detail]', error)
    return Response.json({ error: error.message || 'Failed to fetch commit detail' }, { status: 500 })
  }
}
