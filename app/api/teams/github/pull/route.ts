import { NextRequest } from 'next/server'
import { Octokit } from '@octokit/rest'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const teamWorkspaceId = searchParams.get('teamWorkspaceId')
    const shaOnly = searchParams.get('shaOnly') === 'true'
    const full = searchParams.get('full') === 'true'

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
    const owner = workspace.github_repo_owner
    const repo = workspace.github_repo_name
    const branch = workspace.github_default_branch || 'main'

    // Get HEAD SHA
    const { data: ref } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    })

    const headSha = ref.object.sha

    // If only SHA requested, return early
    if (shaOnly) {
      return Response.json({ sha: headSha })
    }

    // Fetch full repo as ZIP archive (same approach as /api/github/import-repo)
    if (full) {
      // Use direct fetch with auth token (Octokit doesn't handle binary well)
      const zipUrl = `https://api.github.com/repos/${owner}/${repo}/zipball/${branch}`
      const zipResponse = await fetch(zipUrl, {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github+json',
        },
      })

      if (!zipResponse.ok) {
        return Response.json({ error: `Failed to download repo ZIP: ${zipResponse.status}` }, { status: 502 })
      }

      const arrayBuffer = await zipResponse.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // Update last synced SHA
      await admin
        .from('team_workspaces')
        .update({ github_last_synced_sha: headSha })
        .eq('id', teamWorkspaceId)

      // Return ZIP binary with metadata in headers
      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'X-Head-Sha': headSha,
          'X-Repo-Name': repo,
          'X-Repo-Owner': owner,
          'X-Branch': branch,
          'Access-Control-Expose-Headers': 'X-Head-Sha, X-Repo-Name, X-Repo-Owner, X-Branch',
        },
      })
    }

    return Response.json({ sha: headSha })
  } catch (error: any) {
    console.error('[GitHub Pull]', error)
    return Response.json({ error: error.message || 'Failed to pull' }, { status: 500 })
  }
}
