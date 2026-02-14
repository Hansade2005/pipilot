import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { smartBackupToCloud } from '@/lib/cloud-sync'
import { storageManager } from '@/lib/storage-manager'
import { initAutoSync, setAutoSyncEnabled, updateAutoSyncUser, getAutoSyncStatus } from '@/lib/auto-sync-service'

/**
 * Hook to automatically sync codebase changes to the cloud when cloud sync is enabled
 * Now uses real-time event-driven sync with fallback to periodic sync
 */
export function useCloudSync(userId: string | null) {
  const supabase = createClient()
  const lastBackupTime = useRef<number>(Date.now())
  const isSyncing = useRef<boolean>(false)
  const autoSyncInitialized = useRef<boolean>(false)
  const isAiStreaming = useRef<boolean>(false)

  useEffect(() => {
    if (!userId) {
      // Clean up auto-sync when user logs out
      if (autoSyncInitialized.current) {
        updateAutoSyncUser(null)
        autoSyncInitialized.current = false
      }
      return
    }

    // Initialize auto-sync service for real-time sync
    if (!autoSyncInitialized.current) {
      initAutoSync(userId).catch(error => {
        console.error('Failed to initialize auto-sync:', error)
      })
      autoSyncInitialized.current = true
    } else {
      // Update user ID if it changed
      updateAutoSyncUser(userId).catch(error => {
        console.error('Failed to update auto-sync user:', error)
      })
    }

    // Listen for AI streaming state changes to skip backups during streaming
    const handleStreamingState = (e: Event) => {
      const detail = (e as CustomEvent).detail
      isAiStreaming.current = !!detail?.isStreaming
    }
    window.addEventListener('ai-streaming-state', handleStreamingState)

    // Fallback periodic sync function
    const checkAndBackup = async () => {
      // Skip if already syncing, AI is streaming, or not enough time has passed
      if (isSyncing.current || isAiStreaming.current || Date.now() - lastBackupTime.current < 60000) return

      try {
        // Check if cloud sync is enabled
        const { data: settings, error } = await supabase
          .from('user_settings')
          .select('cloud_sync_enabled')
          .eq('user_id', userId)
          .single()

        if (error) {
          console.error('Error fetching user settings:', error)
          return
        }

        if (!settings?.cloud_sync_enabled) {
          // Disable auto-sync if cloud sync is disabled
          setAutoSyncEnabled(false).catch(console.error)
          return
        }

        // Enable auto-sync if it's disabled but should be enabled
        const status = getAutoSyncStatus()
        if (!status.isEnabled) {
          setAutoSyncEnabled(true).catch(console.error)
        }

        // Set syncing flag
        isSyncing.current = true

        // Upload backup to cloud (fallback periodic backup)
        const success = await smartBackupToCloud(userId)

        if (success) {
          lastBackupTime.current = Date.now()
        }
      } catch (error) {
        console.error('Error during fallback auto backup:', error)
      } finally {
        isSyncing.current = false
      }
    }

    // Set up periodic check as fallback (less frequent)
    const interval = setInterval(checkAndBackup, 60000) // Check every 60 seconds as fallback

    // Clean up interval and listener on unmount
    return () => {
      clearInterval(interval)
      window.removeEventListener('ai-streaming-state', handleStreamingState)
    }
  }, [userId])

  // Return functions for manual backup and sync status
  const triggerBackup = async () => {
    if (!userId || isSyncing.current) return false

    try {
      isSyncing.current = true
      const success = await smartBackupToCloud(userId)

      if (success) {
        lastBackupTime.current = Date.now()
      }

      return success
    } catch (error) {
      console.error('Error triggering manual backup:', error)
      return false
    } finally {
      isSyncing.current = false
    }
  }

  // Get current auto-sync status
  const getSyncStatus = () => {
    return getAutoSyncStatus()
  }

  return {
    triggerBackup,
    getSyncStatus,
    // Expose force sync function
    forceSync: async () => {
      if (!userId) return false
      const { forceAutoSync } = await import('@/lib/auto-sync-service')
      return await forceAutoSync()
    }
  }
}