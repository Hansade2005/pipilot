import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface FileLock {
  id: string
  file_path: string
  locked_by: string
  locked_at: string
  expires_at: string
  user?: {
    id: string
    full_name?: string
    email?: string
    avatar_url?: string
  }
}

interface FileChange {
  file_path: string
  action: 'created' | 'updated' | 'deleted'
  changed_by: string
  changed_by_name?: string
  timestamp: string
}

interface UseTeamFileSyncOptions {
  workspaceId: string | undefined
  organizationId: string | undefined
  userId: string
  enabled?: boolean
}

export function useTeamFileSync({
  workspaceId,
  organizationId,
  userId,
  enabled = true
}: UseTeamFileSyncOptions) {
  const [fileLocks, setFileLocks] = useState<FileLock[]>([])
  const [recentChanges, setRecentChanges] = useState<FileChange[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)
  const lockRefreshInterval = useRef<NodeJS.Timeout | null>(null)
  const myLockedFiles = useRef<Set<string>>(new Set())

  // Fetch current locks
  const fetchLocks = useCallback(async () => {
    if (!workspaceId) return

    try {
      const response = await fetch(`/api/teams/file-locks?workspaceId=${workspaceId}`)
      if (response.ok) {
        const data = await response.json()
        setFileLocks(data.locks || [])
      }
    } catch (error) {
      console.error('[TeamFileSync] Error fetching locks:', error)
    }
  }, [workspaceId])

  // Acquire a file lock
  const acquireLock = useCallback(async (filePath: string): Promise<{ success: boolean; error?: string }> => {
    if (!workspaceId) return { success: false, error: 'No workspace' }

    try {
      const response = await fetch('/api/teams/file-locks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, filePath })
      })

      const data = await response.json()

      if (!response.ok) {
        return { success: false, error: data.lockedBy ? `Locked by ${data.lockedBy}` : data.error }
      }

      myLockedFiles.current.add(filePath)
      await fetchLocks()
      return { success: true }
    } catch (error) {
      return { success: false, error: 'Failed to acquire lock' }
    }
  }, [workspaceId, fetchLocks])

  // Release a file lock
  const releaseLock = useCallback(async (filePath: string) => {
    if (!workspaceId) return

    try {
      await fetch(`/api/teams/file-locks?workspaceId=${workspaceId}&filePath=${encodeURIComponent(filePath)}`, {
        method: 'DELETE'
      })
      myLockedFiles.current.delete(filePath)
      await fetchLocks()
    } catch (error) {
      console.error('[TeamFileSync] Error releasing lock:', error)
    }
  }, [workspaceId, fetchLocks])

  // Release all my locks
  const releaseAllLocks = useCallback(async () => {
    const paths = Array.from(myLockedFiles.current)
    await Promise.all(paths.map(p => releaseLock(p)))
  }, [releaseLock])

  // Check if a file is locked by someone else
  const isLockedByOther = useCallback((filePath: string): FileLock | null => {
    const lock = fileLocks.find(l => l.file_path === filePath)
    if (lock && lock.locked_by !== userId && new Date(lock.expires_at) > new Date()) {
      return lock
    }
    return null
  }, [fileLocks, userId])

  // Broadcast a file change via Realtime
  const broadcastFileChange = useCallback((filePath: string, action: FileChange['action']) => {
    if (!channelRef.current) return

    channelRef.current.send({
      type: 'broadcast',
      event: 'file_change',
      payload: {
        file_path: filePath,
        action,
        changed_by: userId,
        timestamp: new Date().toISOString()
      }
    })
  }, [userId])

  // Set up Realtime channel for file changes
  useEffect(() => {
    if (!workspaceId || !organizationId || !enabled) return

    const supabase = createClient()
    const channel = supabase.channel(`team-files:${workspaceId}`, {
      config: { broadcast: { self: false } }
    })

    channel
      .on('broadcast', { event: 'file_change' }, ({ payload }) => {
        const change = payload as FileChange
        setRecentChanges(prev => [change, ...prev].slice(0, 20))
        // Refresh locks when files change
        fetchLocks()
      })
      .on('broadcast', { event: 'lock_change' }, () => {
        fetchLocks()
      })
      .subscribe()

    channelRef.current = channel

    // Initial fetch
    fetchLocks()

    // Refresh my locks every 4 minutes (they expire at 5)
    lockRefreshInterval.current = setInterval(async () => {
      const paths = Array.from(myLockedFiles.current)
      for (const filePath of paths) {
        await fetch('/api/teams/file-locks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId, filePath })
        })
      }
    }, 4 * 60 * 1000)

    return () => {
      channel.unsubscribe()
      channelRef.current = null
      if (lockRefreshInterval.current) {
        clearInterval(lockRefreshInterval.current)
      }
      // Release all locks on unmount
      const paths = Array.from(myLockedFiles.current)
      paths.forEach(filePath => {
        fetch(`/api/teams/file-locks?workspaceId=${workspaceId}&filePath=${encodeURIComponent(filePath)}`, {
          method: 'DELETE'
        }).catch(() => {})
      })
      myLockedFiles.current.clear()
    }
  }, [workspaceId, organizationId, enabled, fetchLocks, userId])

  return {
    fileLocks,
    recentChanges,
    acquireLock,
    releaseLock,
    releaseAllLocks,
    isLockedByOther,
    broadcastFileChange,
    refreshLocks: fetchLocks
  }
}
