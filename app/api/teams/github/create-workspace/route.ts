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

    const { organizationId, workspaceName, githubToken, repoName, repoDescription, isPrivate, initialFiles } = await req.json()

    if (!organizationId || !workspaceName || !githubToken || !repoName) {
      return Response.json({ error: 'Missing required fields: organizationId, workspaceName, githubToken, repoName' }, { status: 400 })
    }

    // Verify user is owner/admin of the organization
    const { data: membership } = await supabase
      .from('team_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return Response.json({ error: 'Only owners and admins can create team workspaces' }, { status: 403 })
    }

    // Create GitHub repo
    const octokit = new Octokit({ auth: githubToken })
    const { data: githubUser } = await octokit.rest.users.getAuthenticated()

    const hasInitialFiles = Array.isArray(initialFiles) && initialFiles.length > 0

    const { data: repo } = await octokit.rest.repos.createForAuthenticatedUser({
      name: repoName,
      description: repoDescription || `Team workspace: ${workspaceName}`,
      private: isPrivate !== false,
      auto_init: true, // Always init with README so we have a base commit
    })

    // Get initial commit SHA
    const { data: ref } = await octokit.rest.git.getRef({
      owner: githubUser.login,
      repo: repo.name,
      ref: 'heads/main',
    })

    let headSha = ref.object.sha

    // If we have project files, push them as the initial commit
    if (hasInitialFiles) {
      try {
        // Create blobs for each file
        const treeEntries = await Promise.all(
          initialFiles.map(async (file: { path: string; content: string }) => {
            const { data: blob } = await octokit.rest.git.createBlob({
              owner: githubUser.login,
              repo: repo.name,
              content: Buffer.from(file.content).toString('base64'),
              encoding: 'base64',
            })
            return {
              path: file.path,
              mode: '100644' as const,
              type: 'blob' as const,
              sha: blob.sha,
            }
          })
        )

        // Create tree with base_tree to keep the README
        const { data: tree } = await octokit.rest.git.createTree({
          owner: githubUser.login,
          repo: repo.name,
          base_tree: headSha,
          tree: treeEntries,
        })

        // Create commit
        const { data: commit } = await octokit.rest.git.createCommit({
          owner: githubUser.login,
          repo: repo.name,
          message: `Initial commit: ${workspaceName} project files`,
          tree: tree.sha,
          parents: [headSha],
          author: {
            name: githubUser.name || githubUser.login,
            email: githubUser.email || `${githubUser.login}@users.noreply.github.com`,
          },
        })

        // Update ref
        await octokit.rest.git.updateRef({
          owner: githubUser.login,
          repo: repo.name,
          ref: 'heads/main',
          sha: commit.sha,
        })

        headSha = commit.sha
      } catch (pushError: any) {
        console.error('[GitHub Create Workspace] Error pushing initial files:', pushError.message)
        // Don't fail workspace creation if file push fails
      }
    }

    // Create team_workspaces row with GitHub columns
    const admin = createAdminClient()
    const { data: workspace, error: wsError } = await admin
      .from('team_workspaces')
      .insert({
        organization_id: organizationId,
        name: workspaceName,
        created_by: user.id,
        visibility: 'team',
        github_repo_owner: githubUser.login,
        github_repo_name: repo.name,
        github_repo_url: repo.html_url,
        github_default_branch: 'main',
        github_last_synced_sha: headSha,
        files: [],
      })
      .select()
      .single()

    if (wsError) {
      // Cleanup: delete the repo if DB insert fails
      try {
        await octokit.rest.repos.delete({ owner: githubUser.login, repo: repo.name })
      } catch {}
      throw wsError
    }

    // Store the GitHub token in the organization settings (encrypted, server-side only)
    await admin
      .from('organizations')
      .update({
        settings: {
          ...(await admin.from('organizations').select('settings').eq('id', organizationId).single()).data?.settings,
          github_token: githubToken,
          github_username: githubUser.login,
        },
      })
      .eq('id', organizationId)

    // Log activity
    await admin.from('team_activity').insert({
      organization_id: organizationId,
      workspace_id: workspace.id,
      action: 'workspace_created',
      actor_id: user.id,
      metadata: {
        workspace_name: workspaceName,
        github_repo: repo.full_name,
        github_url: repo.html_url,
      },
    })

    return Response.json({
      workspace,
      repoUrl: repo.html_url,
      repoFullName: repo.full_name,
    })
  } catch (error: any) {
    console.error('[GitHub Create Workspace]', error)

    if (error.message?.includes('already exists')) {
      return Response.json({ error: 'Repository name already exists on GitHub' }, { status: 409 })
    }
    if (error.message?.includes('Bad credentials')) {
      return Response.json({ error: 'Invalid GitHub token' }, { status: 401 })
    }

    return Response.json({
      error: error.message || 'Failed to create workspace',
    }, { status: 500 })
  }
}
