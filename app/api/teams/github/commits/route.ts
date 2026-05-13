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
    const page = parseInt(searchParams.get('page') || '1')
    const perPage = Math.min(parseInt(searchParams.get('perPage') || '30'), 100)

    if (!teamWorkspaceId) {
      return Response.json({ error: 'Missing teamWorkspaceId' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: workspace } = await admin
      .from('team_workspaces')
      .select('organization_id, github_repo_owner, github_repo_name, github_default_branch')
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
      return Response.json({ error: 'Not a member of this organization' }, { status: 403 })
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

    const { data: commitList } = await octokit.rest.repos.listCommits({
      owner: workspace.github_repo_owner,
      repo: workspace.github_repo_name,
      sha: workspace.github_default_branch || 'main',
      page,
      per_page: perPage,
    })

    const commits = commitList.map(c => ({
      sha: c.sha,
      message: c.commit.message,
      author_name: c.commit.author?.name || c.author?.login || 'Unknown',
      author_email: c.commit.author?.email || '',
      author_avatar: c.author?.avatar_url || '',
      date: c.commit.author?.date || '',
      files_changed: 0, // Would need separate API call per commit for file details
    }))

    return Response.json({ commits })
  } catch (error: any) {
    console.error('[GitHub Commits]', error)
    return Response.json({ error: error.message || 'Failed to fetch commits' }, { status: 500 })
  }
}
