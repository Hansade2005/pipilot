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

    const { teamWorkspaceId, files, deletedPaths, message, lastKnownSha } = await req.json()

    if (!teamWorkspaceId || !message) {
      return Response.json({ error: 'Missing teamWorkspaceId or message' }, { status: 400 })
    }

    if ((!files || files.length === 0) && (!deletedPaths || deletedPaths.length === 0)) {
      return Response.json({ error: 'No files to commit' }, { status: 400 })
    }

    // Get workspace with GitHub info
    const admin = createAdminClient()
    const { data: workspace, error: wsError } = await admin
      .from('team_workspaces')
      .select('id, organization_id, github_repo_owner, github_repo_name, github_default_branch, github_last_synced_sha')
      .eq('id', teamWorkspaceId)
      .single()

    if (wsError || !workspace) {
      return Response.json({ error: 'Workspace not found' }, { status: 404 })
    }

    if (!workspace.github_repo_owner || !workspace.github_repo_name) {
      return Response.json({ error: 'Workspace is not linked to a GitHub repo' }, { status: 400 })
    }

    // Verify membership (editor+)
    const { data: membership } = await supabase
      .from('team_members')
      .select('role')
      .eq('organization_id', workspace.organization_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!membership || !['owner', 'admin', 'editor'].includes(membership.role)) {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Get GitHub token from org settings
    const { data: org } = await admin
      .from('organizations')
      .select('settings')
      .eq('id', workspace.organization_id)
      .single()

    const githubToken = org?.settings?.github_token
    if (!githubToken) {
      return Response.json({ error: 'GitHub token not configured for this organization. Admin must connect GitHub.' }, { status: 400 })
    }

    const octokit = new Octokit({ auth: githubToken })
    const owner = workspace.github_repo_owner
    const repo = workspace.github_repo_name
    const branch = workspace.github_default_branch || 'main'

    // Get current HEAD
    const { data: ref } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    })

    const currentSha = ref.object.sha

    // Conflict detection: if client's lastKnownSha doesn't match current HEAD
    if (lastKnownSha && lastKnownSha !== currentSha) {
      return Response.json({
        error: 'Remote has changed since your last pull. Pull the latest changes first.',
        remoteSha: currentSha,
        localSha: lastKnownSha,
      }, { status: 409 })
    }

    // Get current commit to use its tree as base
    const { data: currentCommit } = await octokit.rest.git.getCommit({
      owner,
      repo,
      commit_sha: currentSha,
    })

    // Build tree entries for changed/added files
    const treeEntries: any[] = []

    if (files && files.length > 0) {
      for (const file of files) {
        const path = file.path.startsWith('/') ? file.path.slice(1) : file.path
        treeEntries.push({
          path,
          mode: '100644' as const,
          type: 'blob' as const,
          content: file.content || '',
        })
      }
    }

    // Handle deletions by setting sha to null
    if (deletedPaths && deletedPaths.length > 0) {
      for (const delPath of deletedPaths) {
        const path = delPath.startsWith('/') ? delPath.slice(1) : delPath
        treeEntries.push({
          path,
          mode: '100644' as const,
          type: 'blob' as const,
          sha: null, // null sha = delete
        })
      }
    }

    // Create tree with base_tree to preserve unchanged files
    const { data: newTree } = await octokit.rest.git.createTree({
      owner,
      repo,
      tree: treeEntries,
      base_tree: currentCommit.tree.sha,
    })

    // Get user profile for commit author
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single()

    // Create commit
    const { data: newCommit } = await octokit.rest.git.createCommit({
      owner,
      repo,
      message,
      tree: newTree.sha,
      parents: [currentSha],
      author: {
        name: profile?.full_name || 'PiPilot User',
        email: profile?.email || user.email || 'noreply@pipilot.dev',
      },
    })

    // Update branch ref
    await octokit.rest.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: newCommit.sha,
    })

    // Update workspace's last synced SHA
    await admin
      .from('team_workspaces')
      .update({ github_last_synced_sha: newCommit.sha })
      .eq('id', teamWorkspaceId)

    // Log activity
    await admin.from('team_activity').insert({
      organization_id: workspace.organization_id,
      workspace_id: teamWorkspaceId,
      action: 'commit',
      actor_id: user.id,
      metadata: {
        message,
        sha: newCommit.sha,
        file_count: (files?.length || 0) + (deletedPaths?.length || 0),
        files: [
          ...(files || []).map((f: any) => ({ path: f.path, status: 'modified' })),
          ...(deletedPaths || []).map((p: string) => ({ path: p, status: 'deleted' })),
        ],
      },
    })

    return Response.json({
      sha: newCommit.sha,
      commitUrl: `https://github.com/${owner}/${repo}/commit/${newCommit.sha}`,
    })
  } catch (error: any) {
    console.error('[GitHub Commit]', error)
    return Response.json({ error: error.message || 'Failed to commit' }, { status: 500 })
  }
}
