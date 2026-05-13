/**
 * GitHub client for team workspaces.
 * All operations go through server-side API routes to keep tokens secure.
 */

export interface GitHubTreeEntry {
  path: string
  mode: string
  type: 'blob' | 'tree'
  sha: string
  size?: number
}

export interface GitHubFileContent {
  path: string
  content: string
  sha: string
}

export interface GitHubCommitEntry {
  sha: string
  message: string
  author_name: string
  author_email: string
  date: string
  files_changed?: number
}

// Fetch all files from a GitHub repo via API route (ZIP download + client-side extraction)
export async function fetchAllFiles(
  teamWorkspaceId: string
): Promise<{ files: GitHubFileContent[]; sha: string }> {
  const res = await fetch(
    `/api/teams/github/pull?teamWorkspaceId=${encodeURIComponent(teamWorkspaceId)}&full=true`
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let errorMsg = 'Failed to fetch files from GitHub'
    try { errorMsg = JSON.parse(text).error || errorMsg } catch {}
    throw new Error(errorMsg)
  }

  const sha = res.headers.get('X-Head-Sha') || ''
  const repoName = res.headers.get('X-Repo-Name') || ''
  const branch = res.headers.get('X-Branch') || 'main'

  // Extract ZIP client-side using JSZip (same pattern as chat-input GitHub import)
  const arrayBuffer = await res.arrayBuffer()
  const zipBlob = new Blob([arrayBuffer], { type: 'application/zip' })

  // Wait for JSZip to load
  if (typeof window !== 'undefined' && !window.JSZip) {
    await new Promise<void>((resolve) => {
      const check = () => {
        if (window.JSZip) resolve()
        else setTimeout(check, 100)
      }
      check()
    })
  }

  if (!window.JSZip) {
    throw new Error('JSZip library not loaded')
  }

  const zip = await window.JSZip.loadAsync(zipBlob)
  const files: GitHubFileContent[] = []

  // GitHub ZIP has a prefix folder like "repo-name-sha/" or "repo-name-branch/"
  // Find the prefix by looking at the first entry
  let prefix = ''
  for (const path of Object.keys(zip.files)) {
    const idx = path.indexOf('/')
    if (idx > 0) {
      prefix = path.substring(0, idx + 1)
      break
    }
  }

  for (const [path, zipEntry] of Object.entries(zip.files)) {
    const entry = zipEntry as any
    if (entry.dir) continue

    // Remove the prefix folder
    const cleanPath = prefix ? path.replace(prefix, '') : path
    if (!cleanPath) continue

    // Skip .git internals and OS junk, but keep project dotfolders like .pipilot
    if (cleanPath === '.git' || cleanPath.startsWith('.git/') || cleanPath.includes('/.git/')) continue
    if (cleanPath === '.DS_Store' || cleanPath.endsWith('/.DS_Store')) continue

    // Normalize path to always have a leading /
    const normalizedPath = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`

    try {
      const content = await entry.async('text')
      files.push({
        path: normalizedPath,
        content,
        sha: '', // Individual file SHAs not available from ZIP
      })
    } catch {
      // Skip binary files that can't be decoded as text
    }
  }

  return { files, sha }
}

// Get HEAD SHA for a team workspace repo
export async function getHeadSha(
  teamWorkspaceId: string
): Promise<string> {
  const res = await fetch(
    `/api/teams/github/pull?teamWorkspaceId=${encodeURIComponent(teamWorkspaceId)}&shaOnly=true`
  )
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Failed to get HEAD SHA')
  }
  const data = await res.json()
  return data.sha
}

// Check for remote changes since a known SHA
export async function checkForRemoteChanges(
  teamWorkspaceId: string,
  lastKnownSha: string
): Promise<{ hasChanges: boolean; remoteSha: string }> {
  const remoteSha = await getHeadSha(teamWorkspaceId)
  return {
    hasChanges: remoteSha !== lastKnownSha,
    remoteSha,
  }
}

// Pull changes since a known SHA (re-downloads full repo as ZIP)
export async function pullChanges(
  teamWorkspaceId: string,
  _sinceSha?: string
): Promise<{ files: GitHubFileContent[]; sha: string }> {
  // Uses the same ZIP-based fetchAllFiles approach
  return fetchAllFiles(teamWorkspaceId)
}

// Commit files to GitHub
export async function commitFiles(
  teamWorkspaceId: string,
  files: Array<{ path: string; content: string }>,
  deletedPaths: string[],
  message: string,
  lastKnownSha: string
): Promise<{ sha: string; commitUrl: string }> {
  const res = await fetch('/api/teams/github/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      teamWorkspaceId,
      files,
      deletedPaths,
      message,
      lastKnownSha,
    }),
  })

  if (res.status === 409) {
    throw new ConflictError('Remote has changed. Pull latest changes first.')
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Failed to commit')
  }

  return res.json()
}

// Fetch commit history
export async function fetchCommits(
  teamWorkspaceId: string,
  page = 1,
  perPage = 30
): Promise<GitHubCommitEntry[]> {
  const params = new URLSearchParams({
    teamWorkspaceId,
    page: String(page),
    perPage: String(perPage),
  })
  const res = await fetch(`/api/teams/github/commits?${params}`)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Failed to fetch commits')
  }
  const data = await res.json()
  return data.commits || []
}

// Fetch detailed commit info (files changed, patches)
export interface CommitDetailFile {
  filename: string
  status: string
  additions: number
  deletions: number
  patch?: string
}

export interface CommitDetail {
  sha: string
  message: string
  author_name: string
  author_email: string
  date: string
  files: CommitDetailFile[]
  stats: { additions: number; deletions: number; total: number }
}

export async function fetchCommitDetail(
  teamWorkspaceId: string,
  sha: string
): Promise<CommitDetail> {
  const params = new URLSearchParams({ teamWorkspaceId, sha })
  const res = await fetch(`/api/teams/github/commits/detail?${params}`)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Failed to fetch commit detail')
  }
  return res.json()
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConflictError'
  }
}
