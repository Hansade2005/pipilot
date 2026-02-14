"use client"

import { useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { restoreBackupFromCloud, isCloudSyncEnabled } from '@/lib/cloud-sync'
import { storageManager } from '@/lib/storage-manager'

const DEVICE_ID_KEY = 'pipilot_device_session_id'
// How long after our own backup we ignore incoming sync events (prevents self-restore).
// 120 seconds is generous — auto-sync fires at most every 5s so this covers many cycles.
const OWN_BACKUP_IGNORE_WINDOW_MS = 120_000

/** Generate or retrieve a unique ID for this browser session */
function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server'
  let id = sessionStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = `device_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    sessionStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

interface RealtimeSyncOptions {
  /** Called after a cross-device restore completes successfully */
  onSyncComplete?: () => void | Promise<void>
  /** Disable the hook without removing it */
  enabled?: boolean
}

/**
 * Hook for real-time cross-device workspace sync.
 *
 * How it works:
 * 1. Each browser tab gets a unique device session ID (sessionStorage).
 * 2. When THIS device backs up, it broadcasts a "sync_ping" on a Supabase
 *    Realtime channel and marks the timestamp locally so it can ignore its
 *    own postgres_changes notifications.
 * 3. When ANOTHER device backs up, this device receives either:
 *    - A Realtime broadcast (instant, requires both devices online)
 *    - A postgres_changes event on user_backups (works even if the other
 *      device closed the tab, since it's driven by the DB row change).
 * 4. On detecting a cross-device backup, silently restore from cloud and
 *    call onSyncComplete so the workspace can refresh its data.
 */
export function useRealtimeSync(
  userId: string | null,
  options?: RealtimeSyncOptions
) {
  const supabase = createClient()
  const deviceId = useRef(getDeviceId())
  const lastOwnBackupTime = useRef<number>(0)
  const isRestoring = useRef(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  /** Mark that this device just backed up (to ignore own events) */
  const markOwnBackup = useCallback(() => {
    lastOwnBackupTime.current = Date.now()
  }, [])

  /** Silently restore from cloud and notify the workspace */
  const performSilentRestore = useCallback(async () => {
    if (!userId || isRestoring.current) return

    // Don't restore while the user is actively on the page — it calls clearAll()
    // which wipes IndexedDB and causes a full re-render, disrupting streaming.
    // Only restore when the tab is in the background (cross-device sync scenario).
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      return
    }

    isRestoring.current = true
    try {
      await storageManager.init()
      const success = await restoreBackupFromCloud(userId)
      if (success) {
        // Notify the parent component
        await options?.onSyncComplete?.()
        // Dispatch a global event so any component can react
        window.dispatchEvent(new CustomEvent('pipilot-sync-restored'))
      }
    } catch (error) {
      console.error('Realtime sync: silent restore failed', error)
    } finally {
      isRestoring.current = false
    }
  }, [userId, options?.onSyncComplete])

  // Set up Supabase Realtime subscriptions
  useEffect(() => {
    if (!userId || options?.enabled === false) return

    // Check if cloud sync is enabled before subscribing
    let cancelled = false

    const setup = async () => {
      const enabled = await isCloudSyncEnabled(userId)
      if (!enabled || cancelled) return

      const channel = supabase
        .channel(`cross-device-sync:${userId}`)
        // 1) postgres_changes: fires whenever user_backups row is updated
        //    (works even if the other device has already closed the page)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'user_backups',
            filter: `user_id=eq.${userId}`
          },
          () => {
            // If we backed up recently, this is our own event — skip restore
            if (Date.now() - lastOwnBackupTime.current < OWN_BACKUP_IGNORE_WINDOW_MS) return
            performSilentRestore()
          }
        )
        // 2) broadcast: immediate cross-device notification (both online)
        .on('broadcast', { event: 'sync_ping' }, (payload: any) => {
          const senderDeviceId = payload?.payload?.deviceId
          if (senderDeviceId === deviceId.current) return
          performSilentRestore()
        })
        .subscribe()

      if (!cancelled) {
        channelRef.current = channel
      } else {
        supabase.removeChannel(channel)
      }
    }

    setup()

    // Also listen for local backup events dispatched by cloud-sync.ts
    const handleLocalBackup = () => {
      markOwnBackup()
      // Broadcast to other devices
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'sync_ping',
          payload: { deviceId: deviceId.current, timestamp: Date.now() }
        })
      }
    }

    window.addEventListener('pipilot-backup-completed', handleLocalBackup)

    return () => {
      cancelled = true
      window.removeEventListener('pipilot-backup-completed', handleLocalBackup)
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [userId, options?.enabled, supabase, performSilentRestore, markOwnBackup])

  /**
   * Call this after your own backup completes.
   * Marks the backup as "ours" so we don't re-restore, and broadcasts
   * a ping so other online devices restore immediately.
   */
  const notifyBackupComplete = useCallback(() => {
    markOwnBackup()
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'sync_ping',
        payload: { deviceId: deviceId.current, timestamp: Date.now() }
      })
    }
  }, [markOwnBackup])

  return {
    /** Call after a successful backup to notify other devices */
    notifyBackupComplete,
    /** Mark that this device backed up (without broadcasting) */
    markOwnBackup,
    /** This browser session's unique device ID */
    deviceId: deviceId.current
  }
}
