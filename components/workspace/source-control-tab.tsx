"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  GitCommit,
  GitBranch,
  Check,
  ChevronRight,
  ChevronDown,
  User,
  Loader2,
  ArrowDown,
  ExternalLink,
  Sparkles,
  Eye,
  FileText,
  FilePlus,
  FileMinus,
  FileEdit,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Streamdown } from "streamdown"
import {
  commitFiles as githubCommitFiles,
  fetchCommits as githubFetchCommits,
  fetchCommitDetail,
  type GitHubCommitEntry,
  type CommitDetail,
} from "@/lib/github-client"

interface SourceControlTabProps {
  projectId: string | undefined
  teamWorkspaceId: string | undefined
  organizationId: string | undefined
  isTeamWorkspace: boolean
  isGitHubBacked?: boolean
  githubRepoUrl?: string
  userId: string
  // GitHub sync hook state (passed from parent)
  lastKnownSha?: string | null
  hasRemoteChanges?: boolean
  isPulling?: boolean
  onPull?: () => Promise<any>
  // Personal project GitHub support
  githubConnected?: boolean
  githubToken?: string
  onPushToGitHub?: () => Promise<any>
  onRepoLinked?: (repoUrl: string) => void
}

interface FileChange {
  path: string
  name: string
  status: "added" | "modified" | "deleted"
  content?: string
  previousContent?: string
}

interface CommitEntry {
  id: string
  sha?: string
  message: string
  author_id?: string
  author_name: string
  author_email?: string
  author_avatar?: string
  file_count: number
  files: any[]
  created_at: string
}

export function SourceControlTab({
  projectId,
  teamWorkspaceId,
  organizationId,
  isTeamWorkspace,
  isGitHubBacked = false,
  githubRepoUrl,
  userId,
  lastKnownSha,
  hasRemoteChanges,
  isPulling,
  onPull,
  githubConnected = false,
  githubToken,
  onPushToGitHub,
  onRepoLinked,
}: SourceControlTabProps) {
  const [commitMessage, setCommitMessage] = useState("")
  const [isCommitting, setIsCommitting] = useState(false)
  const [commits, setCommits] = useState<CommitEntry[]>([])
  const [isLoadingCommits, setIsLoadingCommits] = useState(false)
  const [expandedCommit, setExpandedCommit] = useState<string | null>(null)
  const [view, setView] = useState<"changes" | "history">("changes")
  const [isGeneratingMsg, setIsGeneratingMsg] = useState(false)
  const [commitDetails, setCommitDetails] = useState<Record<string, CommitDetail>>({})
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null)
  const [diffView, setDiffView] = useState<{ title: string; content: string } | null>(null)
  // Personal project GitHub state
  const [isPushingPersonal, setIsPushingPersonal] = useState(false)

  const supabase = useMemo(() => createClient(), [])

  // Gather all project files from IndexedDB for commit
  const gatherProjectFiles = useCallback(async () => {
    if (!projectId) return []
    const { storageManager } = await import("@/lib/storage-manager")
    await storageManager.init()
    const localFiles = await storageManager.getFiles(projectId)
    return localFiles.filter((f: any) => !f.isDirectory && f.content)
  }, [projectId])

  // Load commit history
  const loadCommits = useCallback(async () => {
    // Personal project: fetch commits directly from GitHub API
    if (!isTeamWorkspace && githubRepoUrl && githubToken) {
      setIsLoadingCommits(true)
      try {
        const repoFullName = githubRepoUrl.replace('https://github.com/', '')
        const res = await fetch(`https://api.github.com/repos/${repoFullName}/commits?per_page=30`, {
          headers: { Authorization: `token ${githubToken}` },
        })
        if (!res.ok) throw new Error('Failed to fetch commits')
        const data = await res.json()
        const entries: CommitEntry[] = (data || []).map((c: any) => ({
          id: c.sha,
          sha: c.sha,
          message: c.commit?.message || '',
          author_name: c.commit?.author?.name || c.author?.login || 'Unknown',
          author_email: c.commit?.author?.email || '',
          author_avatar: c.author?.avatar_url,
          file_count: 0,
          files: [],
          created_at: c.commit?.author?.date || '',
        }))
        setCommits(entries)
      } catch (err) {
        console.error('[Source Control] Error loading personal commits:', err)
      } finally {
        setIsLoadingCommits(false)
      }
      return
    }

    if (!teamWorkspaceId) return

    setIsLoadingCommits(true)
    try {
      if (isGitHubBacked) {
        // Fetch real git commits from GitHub
        const gitCommits = await githubFetchCommits(teamWorkspaceId)
        const entries: CommitEntry[] = gitCommits.map((c) => ({
          id: c.sha,
          sha: c.sha,
          message: c.message,
          author_name: c.author_name,
          author_email: c.author_email,
          author_avatar: (c as any).author_avatar,
          file_count: c.files_changed || 0,
          files: [],
          created_at: c.date,
        }))
        setCommits(entries)
      } else {
        // Legacy: load from team_activity
        if (!organizationId) return

        const { data, error } = await supabase
          .from("team_activity")
          .select("*")
          .eq("workspace_id", teamWorkspaceId)
          .eq("action", "commit")
          .order("created_at", { ascending: false })
          .limit(50)

        if (error) throw error

        const authorIds = [
          ...new Set((data || []).map((d: any) => d.actor_id)),
        ]
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", authorIds)

        const profileMap = new Map(
          (profiles || []).map((p: any) => [p.id, p])
        )

        const commitEntries: CommitEntry[] = (data || []).map((d: any) => {
          const profile = profileMap.get(d.actor_id)
          return {
            id: d.id,
            message: d.metadata?.message || "No message",
            author_id: d.actor_id,
            author_name:
              profile?.full_name || d.metadata?.author_name || "Unknown",
            author_email: profile?.email,
            file_count: d.metadata?.file_count || 0,
            files: d.metadata?.files || [],
            created_at: d.created_at,
          }
        })

        setCommits(commitEntries)
      }
    } catch (error) {
      console.error("Error loading commits:", error)
    } finally {
      setIsLoadingCommits(false)
    }
  }, [teamWorkspaceId, organizationId, isGitHubBacked, isTeamWorkspace, githubRepoUrl, githubToken, supabase])

  // Initial load
  useEffect(() => {
    if (isTeamWorkspace || (githubConnected && githubRepoUrl)) {
      loadCommits()
    }
  }, [isTeamWorkspace, githubConnected, githubRepoUrl, loadCommits])

  // Realtime subscription for new commits (legacy mode only)
  useEffect(() => {
    if (!teamWorkspaceId || isGitHubBacked) return

    const channel = supabase
      .channel(`commits:${teamWorkspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "team_activity",
          filter: `workspace_id=eq.${teamWorkspaceId}`,
        },
        (payload: any) => {
          if (payload.new?.action === "commit") {
            loadCommits()
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [teamWorkspaceId, isGitHubBacked, supabase, loadCommits])

  // Load commit detail from GitHub API
  const loadCommitDetail = async (sha: string) => {
    if (!sha || commitDetails[sha]) return
    setLoadingDetail(sha)
    try {
      let detail: CommitDetail

      if (teamWorkspaceId && isGitHubBacked) {
        // Team workspace: use server-side API route
        detail = await fetchCommitDetail(teamWorkspaceId, sha)
      } else if (githubRepoUrl && githubToken) {
        // Personal project: fetch directly from GitHub API
        const repoFullName = githubRepoUrl.replace('https://github.com/', '')
        const res = await fetch(`https://api.github.com/repos/${repoFullName}/commits/${sha}`, {
          headers: { Authorization: `token ${githubToken}` },
        })
        if (!res.ok) throw new Error('Failed to fetch commit detail')
        const data = await res.json()
        detail = {
          sha: data.sha,
          message: data.commit?.message || '',
          author_name: data.commit?.author?.name || data.author?.login || 'Unknown',
          author_email: data.commit?.author?.email || '',
          date: data.commit?.author?.date || '',
          stats: data.stats || { additions: 0, deletions: 0, total: 0 },
          files: (data.files || []).map((f: any) => ({
            filename: f.filename,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
            patch: f.patch?.slice(0, 2000),
          })),
        }
      } else {
        return
      }

      setCommitDetails(prev => ({ ...prev, [sha]: detail }))
    } catch (err: any) {
      console.error('[Source Control] Failed to load commit detail:', err)
      toast.error('Failed to load commit details')
    } finally {
      setLoadingDetail(null)
    }
  }

  // Toggle expand and auto-fetch details
  const toggleCommitExpand = (commitId: string, sha?: string) => {
    if (expandedCommit === commitId) {
      setExpandedCommit(null)
    } else {
      setExpandedCommit(commitId)
      if (sha && isGitHubBacked) {
        loadCommitDetail(sha)
      }
    }
  }

  // Generate rich diff markdown for a commit
  // Show diff inline using Streamdown
  const showDiff = (title: string, content: string) => {
    setDiffView({ title, content })
  }

  const generateCommitDiffMarkdown = (detail: CommitDetail): string => {
    const lines: string[] = []
    lines.push(`# ${detail.message}`)
    lines.push('')
    lines.push(`**Author:** ${detail.author_name} &lt;${detail.author_email}&gt;  `)
    lines.push(`**Date:** ${new Date(detail.date).toLocaleString()}  `)
    lines.push(`**SHA:** \`${detail.sha.slice(0, 12)}\`  `)
    lines.push(`**Stats:** \`+${detail.stats.additions}\` \`-${detail.stats.deletions}\` across ${detail.files.length} file${detail.files.length !== 1 ? 's' : ''}`)
    lines.push('')
    lines.push('---')
    lines.push('')

    for (const file of detail.files) {
      const statusLabel = file.status === 'added' ? 'Added' : file.status === 'removed' ? 'Deleted' : 'Modified'
      lines.push(`### ${statusLabel}: \`${file.filename}\` (+${file.additions} -${file.deletions})`)
      lines.push('')
      if (file.patch) {
        lines.push('```diff')
        lines.push(file.patch)
        lines.push('```')
        lines.push('')
      }
    }

    return lines.join('\n')
  }

  const generateFileDiffMarkdown = (file: CommitDetail['files'][0], commit: CommitEntry, detail: CommitDetail): string => {
    const statusLabel = file.status === 'added' ? 'Added' : file.status === 'removed' ? 'Deleted' : 'Modified'
    const lines = [
      `# ${statusLabel}: \`${file.filename}\``,
      '',
      `**Commit:** ${commit.message}  `,
      `**Author:** ${detail.author_name}  `,
      `**Date:** ${new Date(detail.date).toLocaleString()}  `,
      `**Changes:** \`+${file.additions}\` \`-${file.deletions}\``,
      '',
    ]
    if (file.patch) {
      lines.push('```diff')
      lines.push(file.patch)
      lines.push('```')
    } else {
      lines.push('*No patch available*')
    }
    return lines.join('\n')
  }

  // Generate commit markdown for file status icon
  const fileStatusIcon = (status: string) => {
    switch (status) {
      case 'added': return <FilePlus className="w-3 h-3 text-green-400" />
      case 'removed': return <FileMinus className="w-3 h-3 text-red-400" />
      case 'modified': return <FileEdit className="w-3 h-3 text-orange-400" />
      case 'renamed': return <FileText className="w-3 h-3 text-blue-400" />
      default: return <FileText className="w-3 h-3 text-gray-400" />
    }
  }

  // Generate commit message using a0 LLM API with chat context
  const generateCommitMessage = async () => {
    setIsGeneratingMsg(true)
    try {
      // Get last user/assistant message pair from the active chat session
      let chatContext = ''
      const { storageManager } = await import('@/lib/storage-manager')
      await storageManager.init()

      const sessions = await storageManager.getChatSessions(userId)
      const activeSession = sessions
        .filter(s => s.workspaceId === projectId && s.isActive)
        .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())[0]

      if (activeSession) {
        const msgs = await storageManager.getMessages(activeSession.id)
        const lastUser = [...msgs].reverse().find(m => m.role === 'user')
        const lastAssistant = [...msgs].reverse().find(m => m.role === 'assistant')
        if (lastUser) {
          const userText = typeof lastUser.content === 'string' ? lastUser.content : JSON.stringify(lastUser.content)
          chatContext += `User asked: ${userText.slice(0, 400)}`
        }
        if (lastAssistant) {
          const aiText = typeof lastAssistant.content === 'string' ? lastAssistant.content : JSON.stringify(lastAssistant.content)
          chatContext += `\nAI did: ${aiText.slice(0, 400)}`
        }
      }

      // Get a brief file list for additional context
      const files = await gatherProjectFiles()
      const fileList = files.slice(0, 15).map((f: any) => f.path?.replace(/^\//, '') || f.name).join(', ')

      const res = await fetch('https://api.a0.dev/ai/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: 'You are a commit message generator. Given chat context about what the user asked and what the AI did, write a concise, conventional commit message (1 line, max 72 chars). Use prefixes like feat:, fix:, refactor:, docs:, style:, chore: when appropriate. Focus on the "why" from the conversation. Only output the commit message text, nothing else.'
            },
            {
              role: 'user',
              content: chatContext
                ? `Generate a commit message based on this conversation:\n\n${chatContext}\n\nProject files: ${fileList}`
                : `Generate a commit message for a project with these files: ${fileList}`
            }
          ]
        }),
      })

      if (!res.ok) throw new Error('Failed to generate commit message')

      const data = await res.json()
      const message = (data.completion || '').trim().replace(/^["']|["']$/g, '')

      if (message) {
        setCommitMessage(message)
      } else {
        toast.error("Could not generate a message")
      }
    } catch (err: any) {
      console.error('[Source Control] Commit message generation error:', err)
      toast.error("Failed to generate commit message")
    } finally {
      setIsGeneratingMsg(false)
    }
  }

  // Commit all project files to GitHub (no staging)
  const handleCommit = async () => {
    if (!commitMessage.trim()) return

    // Personal project GitHub push (linked repo or new deploy)
    if (!isTeamWorkspace && githubConnected && githubToken) {
      await handlePersonalGitHubPush()
      return
    }

    if (!teamWorkspaceId || !organizationId) return

    setIsCommitting(true)
    try {
      const allFiles = await gatherProjectFiles()

      if (isGitHubBacked) {
        const filesToCommit = allFiles.map((f: any) => ({
          path: (f.path || f.name).replace(/^\//, ''),
          content: f.content || "",
        }))

        await githubCommitFiles(
          teamWorkspaceId,
          filesToCommit,
          [],
          commitMessage.trim(),
          lastKnownSha || ""
        )

        toast.success(`Committed ${filesToCommit.length} file(s) to GitHub`)
        setCommitMessage("")
        loadCommits()
      } else {
        // Legacy: sync to Supabase JSONB + log activity
        const filesToSync = allFiles.map((f: any) => ({
          path: f.path,
          name: f.name,
          content: f.content || "",
          fileType: f.path?.split(".").pop() || "text",
          size: (f.content || "").length,
          isDirectory: false,
        }))

        const response = await fetch(
          `/api/teams/workspaces/${teamWorkspaceId}/sync`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ files: filesToSync }),
          }
        )

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || "Sync failed")
        }

        await supabase.from("team_activity").insert({
          organization_id: organizationId,
          workspace_id: teamWorkspaceId,
          action: "commit",
          actor_id: userId,
          metadata: {
            message: commitMessage.trim(),
            file_count: allFiles.length,
            author_name:
              (await supabase.auth.getUser()).data.user?.user_metadata
                ?.full_name || "Unknown",
          },
        })

        toast.success(`Committed ${allFiles.length} file(s)`)
        setCommitMessage("")
        loadCommits()
      }
    } catch (error: any) {
      if (error.name === "ConflictError") {
        toast.error("Remote has changed. Pull latest changes first.")
      } else {
        toast.error(error.message || "Commit failed")
      }
    } finally {
      setIsCommitting(false)
    }
  }

  // Generate diff markdown for a file
  const generateDiffMarkdown = (file: FileChange): string => {
    const lines: string[] = []
    lines.push(
      `# ${
        file.status === "added"
          ? "New File"
          : file.status === "deleted"
          ? "Deleted File"
          : "Modified File"
      }: \`${file.path}\`\n`
    )
    lines.push(
      `**Status:** ${
        file.status.charAt(0).toUpperCase() + file.status.slice(1)
      }\n`
    )

    if (file.status === "added" && file.content) {
      lines.push("## Added Content\n")
      const ext = file.path.split(".").pop() || ""
      lines.push("```" + ext)
      lines.push(file.content)
      lines.push("```\n")
    } else if (file.status === "deleted" && file.previousContent) {
      lines.push("## Deleted Content\n")
      const ext = file.path.split(".").pop() || ""
      lines.push("```" + ext)
      lines.push(file.previousContent)
      lines.push("```\n")
    } else if (file.status === "modified") {
      if (file.previousContent) {
        lines.push("## Previous Version\n")
        const ext = file.path.split(".").pop() || ""
        lines.push("```" + ext)
        lines.push(file.previousContent)
        lines.push("```\n")
      }
      if (file.content) {
        lines.push("## Current Version\n")
        const ext = file.path.split(".").pop() || ""
        lines.push("```" + ext)
        lines.push(file.content)
        lines.push("```\n")
      }
    }

    return lines.join("\n")
  }

  const generateCommitMarkdown = (commit: CommitEntry): string => {
    const lines: string[] = []
    lines.push(`# Commit: ${commit.message}\n`)
    if (commit.sha) {
      lines.push(`**SHA:** \`${commit.sha.slice(0, 7)}\``)
    }
    lines.push(`**Author:** ${commit.author_name}`)
    lines.push(`**Date:** ${new Date(commit.created_at).toLocaleString()}`)
    lines.push(`**Files changed:** ${commit.file_count}\n`)

    if (commit.files.length > 0) {
      lines.push("## Changed Files\n")
      for (const file of commit.files) {
        const f =
          typeof file === "string"
            ? { path: file, status: "modified" }
            : file
        const icon =
          (f as any).status === "added"
            ? "+"
            : (f as any).status === "deleted"
            ? "-"
            : "~"
        lines.push(`- \`${icon}\` \`${(f as any).path || f}\``)
      }
    }

    return lines.join("\n")
  }

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diff < 60) return "just now"
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
    return date.toLocaleDateString()
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case "added":
        return <span className="text-green-400 text-xs font-bold">A</span>
      case "modified":
        return <span className="text-orange-400 text-xs font-bold">M</span>
      case "deleted":
        return <span className="text-red-400 text-xs font-bold">D</span>
      default:
        return null
    }
  }

  // Personal project GitHub deploy state
  const [personalMode, setPersonalMode] = useState<'new' | 'existing'>('new')
  const [personalRepoName, setPersonalRepoName] = useState('')
  const [personalSelectedRepo, setPersonalSelectedRepo] = useState('')
  const [personalRepos, setPersonalRepos] = useState<Array<{ name: string; full_name: string }>>([])
  const [isLoadingRepos, setIsLoadingRepos] = useState(false)

  // Fetch user's GitHub repos when switching to existing mode
  useEffect(() => {
    if (!githubToken || personalMode !== 'existing' || personalRepos.length > 0) return
    setIsLoadingRepos(true)
    fetch('https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner', {
      headers: { Authorization: `token ${githubToken}` },
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setPersonalRepos(data.map((r: any) => ({ name: r.name, full_name: r.full_name })))
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingRepos(false))
  }, [githubToken, personalMode, personalRepos.length])

  // Personal project: push to GitHub via deploy API
  const handlePersonalGitHubPush = async () => {
    if (!projectId || !githubToken) return
    setIsPushingPersonal(true)

    try {
      const allFiles = await gatherProjectFiles()
      if (allFiles.length === 0) {
        toast.error("No files to push")
        return
      }

      const { filterUnwantedFiles } = await import('@/lib/utils')
      const filteredFiles = filterUnwantedFiles(allFiles as any)

      // Determine mode: if repo already linked, push to it; otherwise create/link
      const hasLinkedRepo = !!githubRepoUrl
      const repoFullName = hasLinkedRepo ? githubRepoUrl!.replace('https://github.com/', '') : undefined

      const response = await fetch('/api/deploy/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: filteredFiles.map((f: any) => ({
            path: (f.path || f.name).replace(/^\//, ''),
            content: f.content || '',
          })),
          mode: hasLinkedRepo ? 'push' : personalMode === 'new' ? 'create' : 'existing',
          repoName: !hasLinkedRepo && personalMode === 'new' ? personalRepoName : repoFullName?.split('/')[1],
          existingRepo: hasLinkedRepo ? repoFullName : personalMode === 'existing' ? personalSelectedRepo : undefined,
          commitMessage: commitMessage.trim() || 'Update project files',
          githubToken,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Push failed')
      }

      const data = await response.json()
      toast.success(`Pushed to ${data.repoName || data.repoUrl}`)
      setCommitMessage('')
      // Notify parent to update project's githubRepoUrl
      if (data.repoUrl) {
        onRepoLinked?.(data.repoUrl)
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to push to GitHub")
    } finally {
      setIsPushingPersonal(false)
    }
  }

  if (!isTeamWorkspace && !githubConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
        <GitBranch className="h-12 w-12 text-gray-600 mb-4" />
        <h3 className="text-sm font-medium text-gray-300 mb-2">
          Source Control
        </h3>
        <p className="text-xs text-gray-500 mb-4 max-w-[240px]">
          Connect GitHub in your account settings to push code and track commits.
        </p>
        <a
          href="/workspace/account"
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-orange-600 hover:bg-orange-500 text-white transition-colors"
        >
          Connect GitHub
        </a>
      </div>
    )
  }

  // Personal project with GitHub connected but no repo linked yet — show deploy setup
  if (!isTeamWorkspace && githubConnected && !githubRepoUrl) {
    return (
      <div className="flex flex-col h-full bg-gray-950">
        <div className="px-3 py-2 border-b border-gray-800/60">
          <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
            <GitBranch className="w-3.5 h-3.5 text-orange-400" />
            Push to GitHub
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* Mode selector */}
          <div className="flex gap-1.5">
            <button
              onClick={() => setPersonalMode('new')}
              className={cn(
                "flex-1 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors border",
                personalMode === 'new'
                  ? "bg-orange-600/15 text-orange-400 border-orange-500/30"
                  : "text-gray-400 border-gray-700 hover:border-gray-600"
              )}
            >
              New Repository
            </button>
            <button
              onClick={() => setPersonalMode('existing')}
              className={cn(
                "flex-1 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors border",
                personalMode === 'existing'
                  ? "bg-orange-600/15 text-orange-400 border-orange-500/30"
                  : "text-gray-400 border-gray-700 hover:border-gray-600"
              )}
            >
              Existing Repository
            </button>
          </div>

          {personalMode === 'new' ? (
            <div className="space-y-1.5">
              <label className="text-[11px] text-gray-400 font-medium">Repository Name</label>
              <input
                value={personalRepoName}
                onChange={(e) => setPersonalRepoName(e.target.value.replace(/[^a-zA-Z0-9._-]/g, '-'))}
                placeholder="e.g., my-project"
                className="w-full h-8 px-2.5 rounded-lg border border-gray-800 bg-gray-900/50 text-xs text-gray-100 placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-500/50 focus:border-orange-500/50"
              />
              <p className="text-[10px] text-gray-600">A new private repo will be created</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-[11px] text-gray-400 font-medium">Select Repository</label>
              {isLoadingRepos ? (
                <div className="flex items-center gap-2 py-2">
                  <Loader2 className="w-3 h-3 animate-spin text-orange-400" />
                  <span className="text-[11px] text-gray-500">Loading repos...</span>
                </div>
              ) : (
                <select
                  value={personalSelectedRepo}
                  onChange={(e) => setPersonalSelectedRepo(e.target.value)}
                  className="w-full h-8 px-2 rounded-lg border border-gray-800 bg-gray-900/50 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-orange-500/50"
                >
                  <option value="">Select a repository...</option>
                  {personalRepos.map(r => (
                    <option key={r.full_name} value={r.full_name}>{r.full_name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Commit message */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-gray-400 font-medium">Commit Message</label>
            <div className="relative">
              <input
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Update project files"
                className="w-full h-8 px-2.5 pr-7 rounded-lg border border-gray-800 bg-gray-900/50 text-xs text-gray-100 placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-500/50 focus:border-orange-500/50"
              />
              <button
                onClick={generateCommitMessage}
                disabled={isGeneratingMsg}
                className="absolute right-1.5 top-1.5 h-5 w-5 flex items-center justify-center rounded text-gray-500 hover:text-orange-400 hover:bg-orange-500/10 disabled:opacity-30 transition-colors"
                title="Generate commit message with AI"
              >
                {isGeneratingMsg ? (
                  <Loader2 className="w-3 h-3 animate-spin text-orange-400" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
              </button>
            </div>
          </div>

          {/* Push button */}
          <Button
            size="sm"
            onClick={handlePersonalGitHubPush}
            disabled={
              isPushingPersonal ||
              (personalMode === 'new' && !personalRepoName.trim()) ||
              (personalMode === 'existing' && !personalSelectedRepo)
            }
            className="w-full h-8 text-xs bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-30"
          >
            {isPushingPersonal ? (
              <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
            ) : (
              <GitCommit className="w-3 h-3 mr-1.5" />
            )}
            {personalMode === 'new' ? 'Create & Push' : 'Push to Repository'}
          </Button>

          {githubRepoUrl && (
            <a
              href={githubRepoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[11px] text-orange-400 hover:text-orange-300 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              {githubRepoUrl.replace('https://github.com/', '')}
            </a>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-950 relative">
      {/* Header */}
      <div className="flex items-center border-b border-gray-800/60 px-3 py-1.5 gap-1 flex-shrink-0">
        <button
          onClick={() => setView("changes")}
          className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
            view === "changes"
              ? "bg-orange-600/15 text-orange-400"
              : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
          )}
        >
          Commit
        </button>
        <button
          onClick={() => {
            setView("history")
            loadCommits()
          }}
          className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
            view === "history"
              ? "bg-orange-600/15 text-orange-400"
              : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
          )}
        >
          History
        </button>
        <div className="flex-1" />

        {/* Pull button for GitHub-backed workspaces */}
        {isGitHubBacked && onPull && (
          <button
            onClick={async () => {
              const result = await onPull()
              if (result?.success) {
                toast.success(
                  `Pulled ${result.filesUpdated || 0} file(s) from GitHub`
                )
                scanForChanges()
              } else if (result?.error) {
                toast.error(result.error)
              }
            }}
            disabled={isPulling}
            className={cn(
              "h-6 px-2 flex items-center gap-1 rounded text-xs transition-colors",
              hasRemoteChanges
                ? "text-orange-400 bg-orange-500/10 hover:bg-orange-500/20"
                : "text-gray-500 hover:text-orange-400 hover:bg-orange-500/10"
            )}
            title={
              hasRemoteChanges
                ? "Remote changes available - click to pull"
                : "Pull latest from GitHub"
            }
          >
            {isPulling ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <ArrowDown className="w-3 h-3" />
            )}
            {hasRemoteChanges && (
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
            )}
          </button>
        )}

        {/* GitHub repo link */}
        {isGitHubBacked && githubRepoUrl && (
          <a
            href={githubRepoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="h-6 w-6 flex items-center justify-center rounded text-gray-500 hover:text-orange-400 hover:bg-orange-500/10 transition-colors"
            title="Open on GitHub"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        )}

      </div>

      {view === "changes" ? (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Commit Message Input + Button */}
          <div className="px-3 py-3 flex-shrink-0">
            <div className="relative">
              <textarea
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder={
                  isGitHubBacked
                    ? "Commit message (pushes to GitHub)..."
                    : "Commit message..."
                }
                className="w-full h-16 resize-none rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2 pr-8 text-xs text-gray-100 placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-500/50 focus:border-orange-500/50 transition-colors"
              />
              <button
                onClick={generateCommitMessage}
                disabled={isGeneratingMsg}
                className="absolute right-2 top-2 h-5 w-5 flex items-center justify-center rounded text-gray-500 hover:text-orange-400 hover:bg-orange-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Generate commit message with AI"
              >
                {isGeneratingMsg ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-400" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            <Button
              size="sm"
              onClick={handleCommit}
              disabled={isCommitting || !commitMessage.trim()}
              className="w-full h-7 text-xs bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-30 mt-1.5"
            >
              {isCommitting ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Check className="w-3 h-3 mr-1" />
              )}
              {isGitHubBacked ? 'Commit & Push' : 'Commit'}
            </Button>
            <p className="text-[10px] text-gray-600 mt-1.5 text-center">
              Commits all project files to the repository
            </p>
          </div>
        </div>
      ) : (
        /* History / Git Tree View */
        <div className="flex-1 overflow-y-auto">
          {isLoadingCommits ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-4 h-4 text-orange-400 animate-spin mr-2" />
              <span className="text-xs text-gray-500">
                Loading history...
              </span>
            </div>
          ) : commits.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <GitCommit className="h-8 w-8 text-gray-600 mb-2" />
              <p className="text-xs text-gray-500">
                No commits yet. Commit your changes to start tracking history.
              </p>
            </div>
          ) : (
            <div className="relative">
              {/* Git tree line */}
              <div className="absolute left-[22px] top-0 bottom-0 w-px bg-gray-800" />

              {commits.map((commit, index) => {
                const detail = commit.sha ? commitDetails[commit.sha] : null
                const isExpanded = expandedCommit === commit.id
                const isLoadingThis = loadingDetail === commit.sha

                return (
                  <div key={commit.id} className="relative">
                    <button
                      onClick={() => toggleCommitExpand(commit.id, commit.sha)}
                      className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-gray-800/40 transition-colors text-left"
                    >
                      {/* Tree dot */}
                      <div className="relative z-10 w-[18px] h-[18px] flex items-center justify-center flex-shrink-0 mt-0.5">
                        <div
                          className={cn(
                            "w-2.5 h-2.5 rounded-full border-2",
                            index === 0
                              ? "bg-orange-500 border-orange-500"
                              : "bg-gray-950 border-gray-600"
                          )}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-200 font-medium truncate">
                          {commit.message}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-gray-500 flex items-center gap-1">
                            <User className="w-2.5 h-2.5" />
                            {commit.author_name}
                          </span>
                          {commit.sha && (
                            <span className="text-[10px] text-gray-600 font-mono">
                              {commit.sha.slice(0, 7)}
                            </span>
                          )}
                          <span className="text-[10px] text-gray-600">
                            {formatTimeAgo(commit.created_at)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        {commit.sha && isGitHubBacked && detail && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              showDiff(
                                `Commit: ${commit.message}`,
                                generateCommitDiffMarkdown(detail)
                              )
                            }}
                            className="h-5 w-5 flex items-center justify-center rounded text-gray-500 hover:text-orange-400 hover:bg-orange-500/10"
                            title="View full diff in editor"
                          >
                            <Eye className="w-3 h-3" />
                          </button>
                        )}
                        {commit.sha && githubRepoUrl && (
                          <a
                            href={`${githubRepoUrl}/commit/${commit.sha}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="h-5 w-5 flex items-center justify-center rounded text-gray-500 hover:text-orange-400 hover:bg-orange-500/10"
                            title="View on GitHub"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        {isExpanded ? (
                          <ChevronDown className="w-3 h-3 text-gray-500" />
                        ) : (
                          <ChevronRight className="w-3 h-3 text-gray-500" />
                        )}
                      </div>
                    </button>

                    {/* Expanded commit detail */}
                    {isExpanded && (
                      <div className="pl-[34px] pb-2 pr-3">
                        {isLoadingThis ? (
                          <div className="flex items-center gap-2 py-2 px-2">
                            <Loader2 className="w-3 h-3 animate-spin text-orange-400" />
                            <span className="text-[11px] text-gray-500">Loading commit details...</span>
                          </div>
                        ) : detail ? (
                          <>
                            {/* Stats summary */}
                            <div className="flex items-center gap-3 px-2 py-1.5 mb-1 rounded bg-gray-900/50 border border-gray-800/40">
                              <span className="text-[10px] text-green-400">+{detail.stats.additions}</span>
                              <span className="text-[10px] text-red-400">-{detail.stats.deletions}</span>
                              <span className="text-[10px] text-gray-500">{detail.files.length} file{detail.files.length !== 1 ? 's' : ''}</span>
                              <div className="flex-1" />
                              <button
                                onClick={() => showDiff(
                                  `Commit: ${commit.message}`,
                                  generateCommitDiffMarkdown(detail)
                                )}
                                className="text-[10px] text-orange-400 hover:text-orange-300 flex items-center gap-1"
                              >
                                <Eye className="w-2.5 h-2.5" />
                                View full diff
                              </button>
                            </div>
                            {/* File list */}
                            <div className={detail.files.length > 8 ? "max-h-[208px] overflow-y-auto" : ""}>
                              {detail.files.map((file, fi) => (
                                <div
                                  key={fi}
                                  className="flex items-center gap-2 px-2 py-1 hover:bg-gray-800/30 rounded cursor-pointer group"
                                  onClick={() => {
                                    showDiff(file.filename, generateFileDiffMarkdown(file, commit, detail))
                                  }}
                                >
                                  {fileStatusIcon(file.status)}
                                  <span className="flex-1 text-[11px] text-gray-400 truncate">{file.filename}</span>
                                  <span className="text-[9px] text-green-400/70 opacity-0 group-hover:opacity-100">+{file.additions}</span>
                                  <span className="text-[9px] text-red-400/70 opacity-0 group-hover:opacity-100">-{file.deletions}</span>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : commit.files.length > 0 ? (
                          /* Fallback: legacy commit files without detail */
                          commit.files.map((file: any, fi: number) => {
                            const filePath = typeof file === "string" ? file : file.path
                            const fileStatus = typeof file === "string" ? "modified" : file.status || "modified"
                            return (
                              <div
                                key={fi}
                                className="flex items-center gap-2 px-2 py-0.5 hover:bg-gray-800/30 rounded cursor-pointer"
                              >
                                {statusIcon(fileStatus)}
                                <span className="text-[11px] text-gray-400 truncate">{filePath}</span>
                              </div>
                            )
                          })
                        ) : (
                          <p className="text-[11px] text-gray-600 px-2 py-1">No file details available</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Inline Diff Viewer */}
      {diffView && (
        <div className="absolute inset-0 z-20 bg-gray-950 flex flex-col">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-800/60 flex-shrink-0">
            <button
              onClick={() => setDiffView(null)}
              className="h-6 px-2 flex items-center gap-1 rounded text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
            >
              <ChevronRight className="w-3 h-3 rotate-180" />
              Back
            </button>
            <span className="text-xs text-gray-300 font-medium truncate flex-1">{diffView.title}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <Streamdown
              shikiTheme={['github-light', 'github-dark-dimmed']}
              className={cn(
                "text-sm leading-relaxed break-words [overflow-wrap:anywhere]",
                "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
                "[&>p]:mb-3 [&>p]:text-gray-300",
                "[&>h1]:mb-3 [&>h1]:text-base [&>h1]:font-bold [&>h1]:text-gray-100",
                "[&>h2]:mb-2 [&>h2]:text-sm [&>h2]:font-semibold [&>h2]:text-gray-200",
                "[&>h3]:mb-2 [&>h3]:text-xs [&>h3]:font-semibold [&>h3]:text-gray-200",
                "[&>hr]:my-3 [&>hr]:border-gray-800",
                "[&>pre]:mb-3 [&>pre]:overflow-x-auto [&>pre]:rounded-lg [&>pre]:border [&>pre]:border-gray-700/50 [&>pre]:text-xs",
                "[&_code]:text-xs",
                "[&>blockquote]:mb-3 [&>blockquote]:border-l-4 [&>blockquote]:border-gray-700 [&>blockquote]:pl-3 [&>blockquote]:text-gray-400",
              )}
            >
              {diffView.content}
            </Streamdown>
          </div>
        </div>
      )}
    </div>
  )
}
