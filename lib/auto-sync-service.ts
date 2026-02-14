// Auto-sync service that listens to storage events and syncs to cloud automatically

import { storageEventManager, StorageEventData } from './storage-events'
import { smartBackupToCloud, isCloudSyncEnabled } from './cloud-sync'
import { storageManager } from './storage-manager'

/**
 * Auto-sync service for real-time cloud synchronization
 */
class AutoSyncService {
  private userId: string | null = null
  private isEnabled = false
  private isInitialized = false
  private lastSyncTime = 0
  private syncThrottleMs = 5000 // Minimum 5 seconds between syncs
  private pendingSync: Promise<boolean> | null = null
  private unsubscribeFunctions: (() => void)[] = []
  private consecutiveFailures = 0
  private maxConsecutiveFailures = 5
  private backoffMultiplier = 2
  private maxBackoffMs = 300000 // 5 minutes max backoff
  private retryTimeout: NodeJS.Timeout | null = null
  private eventBuffer: StorageEventData[] = []
  private bufferTimeout: NodeJS.Timeout | null = null
  private bufferDelayMs = 2000 // Buffer events for 2 seconds before sync
  private isPausedForStreaming = false
  private resumeSyncTimeout: NodeJS.Timeout | null = null

  /**
   * Initialize the auto-sync service
   */
  async init(userId: string): Promise<void> {
    if (this.isInitialized) {
      this.cleanup()
    }

    this.userId = userId
    this.isInitialized = true

    // Check if cloud sync is enabled
    this.isEnabled = await isCloudSyncEnabled(userId)

    if (this.isEnabled) {
      this.setupEventListeners()
    }
  }

  /**
   * Setup event listeners for storage changes
   */
  private setupEventListeners(): void {
    // Listen to all storage events
    const unsubscribe = storageEventManager.onAny(async (event: StorageEventData) => {
      await this.handleStorageEvent(event)
    })

    this.unsubscribeFunctions.push(unsubscribe)

    console.log('Auto-sync service: Event listeners set up')
  }

  /**
   * Handle storage events and trigger sync
   */
  private async handleStorageEvent(event: StorageEventData): Promise<void> {
    if (!this.isEnabled || !this.userId) {
      return
    }

    // Skip sync for certain operations or tables if needed
    if (this.shouldSkipSync(event)) {
      return
    }

    // Add event to buffer
    this.eventBuffer.push(event)

    // Clear existing buffer timeout
    if (this.bufferTimeout) {
      clearTimeout(this.bufferTimeout)
    }

    // Set new buffer timeout to process events
    this.bufferTimeout = setTimeout(async () => {
      await this.processBufferedEvents()
    }, this.bufferDelayMs)
  }

  /**
   * Process buffered events and trigger sync
   */
  private async processBufferedEvents(): Promise<void> {
    if (this.eventBuffer.length === 0) return

    // If paused for streaming, keep events buffered — they'll be processed on resume
    if (this.isPausedForStreaming) return

    // Clear buffer and timeout
    const events = [...this.eventBuffer]
    this.eventBuffer = []
    this.bufferTimeout = null

    // Throttle sync operations
    const now = Date.now()
    if (now - this.lastSyncTime < this.syncThrottleMs) {
      // Schedule a delayed sync if we don't have one pending
      if (!this.pendingSync) {
        this.pendingSync = new Promise((resolve) => {
          setTimeout(async () => {
            const result = await this.performSync()
            this.pendingSync = null
            resolve(result)
          }, this.syncThrottleMs - (now - this.lastSyncTime))
        })
      }
      return
    }

    // Perform sync with events context
    await this.performSync(events)
  }

  /**
   * Perform the actual sync operation
   */
  private async performSync(events?: StorageEventData[]): Promise<boolean> {
    if (!this.userId) return false

    // Clear any pending retry timeout
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout)
      this.retryTimeout = null
    }

    try {
      this.lastSyncTime = Date.now()

      // Double-check that sync is still enabled
      const stillEnabled = await isCloudSyncEnabled(this.userId)
      if (!stillEnabled) {
        this.isEnabled = false
        this.consecutiveFailures = 0 // Reset failures
        return false
      }

      const eventCount = events?.length || 0
      console.log(`Auto-sync service: Syncing ${eventCount} changes to cloud...`)

      const success = await smartBackupToCloud(this.userId)

      if (success) {
        console.log('Auto-sync service: Sync completed successfully')
        this.consecutiveFailures = 0 // Reset consecutive failures on success
        return true
      } else {
        await this.handleSyncFailure('Upload failed')
        return false
      }
    } catch (error) {
      await this.handleSyncFailure(`Sync error: ${error}`)
      return false
    }
  }

  /**
   * Handle sync failure with exponential backoff
   */
  private async handleSyncFailure(reason: string): Promise<void> {
    this.consecutiveFailures++

    console.warn(`Auto-sync service: Sync failed (${this.consecutiveFailures}/${this.maxConsecutiveFailures}): ${reason}`)

    // If we've reached max consecutive failures, disable auto-sync temporarily
    if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
      console.error('Auto-sync service: Too many consecutive failures, disabling auto-sync temporarily')
      this.isEnabled = false
      this.consecutiveFailures = 0

      // Re-enable after a longer delay
      setTimeout(async () => {
        if (this.userId) {
          const stillEnabled = await isCloudSyncEnabled(this.userId!)
          if (stillEnabled) {
            console.log('Auto-sync service: Re-enabling auto-sync after failure timeout')
            this.isEnabled = true
          }
        }
      }, 300000) // 5 minutes

      return
    }

    // Schedule retry with exponential backoff
    const backoffDelay = Math.min(
      this.syncThrottleMs * Math.pow(this.backoffMultiplier, this.consecutiveFailures - 1),
      this.maxBackoffMs
    )

    console.log(`Auto-sync service: Retrying in ${backoffDelay / 1000} seconds...`)

    this.retryTimeout = setTimeout(async () => {
      if (this.isEnabled && this.userId) {
        await this.performSync()
      }
    }, backoffDelay)
  }

  /**
   * Determine if sync should be skipped for certain events
   */
  private shouldSkipSync(event: StorageEventData): boolean {
    // Skip high-frequency tables that change during AI streaming.
    // These tables are still included in the backup payload when a sync IS
    // triggered by other events (e.g. file changes), but they won't CAUSE
    // a sync on their own — preventing constant uploads during streaming.
    const skipTables = [
      'checkpoints',
      'conversationMemories',
      'messages',       // Written on every AI stream chunk — too frequent
      'chatSessions',   // Updated alongside messages during streaming
    ]

    if (skipTables.includes(event.tableName)) {
      return true
    }

    // Skip if userId doesn't match (for user-specific data)
    if (event.userId && event.userId !== this.userId) {
      return true
    }

    return false
  }

  /**
   * Enable or disable auto-sync
   */
  async setEnabled(enabled: boolean): Promise<void> {
    this.isEnabled = enabled

    if (enabled && !this.unsubscribeFunctions.length) {
      this.setupEventListeners()
    } else if (!enabled) {
      this.cleanup()
    }
  }

  /**
   * Update user ID (useful when user changes)
   */
  async updateUserId(userId: string | null): Promise<void> {
    if (this.userId === userId) return

    this.userId = userId

    if (userId) {
      await this.init(userId)
    } else {
      this.cleanup()
    }
  }

  /**
   * Get current status
   */
  getStatus(): {
    isEnabled: boolean
    isInitialized: boolean
    userId: string | null
    lastSyncTime: number
    hasPendingSync: boolean
    consecutiveFailures: number
    bufferedEvents: number
    isRetrying: boolean
  } {
    return {
      isEnabled: this.isEnabled,
      isInitialized: this.isInitialized,
      userId: this.userId,
      lastSyncTime: this.lastSyncTime,
      hasPendingSync: !!this.pendingSync,
      consecutiveFailures: this.consecutiveFailures,
      bufferedEvents: this.eventBuffer.length,
      isRetrying: !!this.retryTimeout
    }
  }

  /**
   * Force a sync operation
   */
  async forceSync(): Promise<boolean> {
    if (!this.userId || !this.isEnabled) return false

    // Cancel any pending throttled sync
    if (this.pendingSync) {
      this.pendingSync = null
    }

    return await this.performSync()
  }

  /**
   * Pause auto-sync while AI is actively streaming.
   * Events are still buffered and will be processed when resume is called.
   * Includes a safety timeout to auto-resume after 5 minutes.
   */
  pauseForStreaming(): void {
    this.isPausedForStreaming = true

    // Clear any pending buffer timeout — we'll process on resume
    if (this.bufferTimeout) {
      clearTimeout(this.bufferTimeout)
      this.bufferTimeout = null
    }

    // Safety: auto-resume after 5 minutes in case resume is never called
    if (this.resumeSyncTimeout) {
      clearTimeout(this.resumeSyncTimeout)
    }
    this.resumeSyncTimeout = setTimeout(() => {
      this.resumeAfterStreaming()
    }, 300000)
  }

  /**
   * Resume auto-sync after streaming completes.
   * Processes any buffered events that accumulated during the pause.
   */
  resumeAfterStreaming(): void {
    this.isPausedForStreaming = false

    if (this.resumeSyncTimeout) {
      clearTimeout(this.resumeSyncTimeout)
      this.resumeSyncTimeout = null
    }

    // Process any events that were buffered during the pause
    if (this.eventBuffer.length > 0) {
      // Small delay to let the UI settle after streaming ends
      this.bufferTimeout = setTimeout(async () => {
        await this.processBufferedEvents()
      }, 3000)
    }
  }

  /**
   * Cleanup event listeners and timeouts
   */
  private cleanup(): void {
    this.unsubscribeFunctions.forEach(unsubscribe => unsubscribe())
    this.unsubscribeFunctions = []

    if (this.bufferTimeout) {
      clearTimeout(this.bufferTimeout)
      this.bufferTimeout = null
    }

    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout)
      this.retryTimeout = null
    }

    if (this.resumeSyncTimeout) {
      clearTimeout(this.resumeSyncTimeout)
      this.resumeSyncTimeout = null
    }

    this.isPausedForStreaming = false
    this.pendingSync = null
    this.eventBuffer = []
  }

  /**
   * Destroy the service
   */
  destroy(): void {
    this.cleanup()
    this.isInitialized = false
    this.isEnabled = false
    this.userId = null
    this.consecutiveFailures = 0
  }
}

// Create singleton instance
export const autoSyncService = new AutoSyncService()

/**
 * Initialize auto-sync for a user
 */
export async function initAutoSync(userId: string): Promise<void> {
  await autoSyncService.init(userId)
}

/**
 * Enable/disable auto-sync
 */
export async function setAutoSyncEnabled(enabled: boolean): Promise<void> {
  await autoSyncService.setEnabled(enabled)
}

/**
 * Update the user ID for auto-sync
 */
export async function updateAutoSyncUser(userId: string | null): Promise<void> {
  await autoSyncService.updateUserId(userId)
}

/**
 * Force an immediate sync
 */
export async function forceAutoSync(): Promise<boolean> {
  return await autoSyncService.forceSync()
}

/**
 * Get auto-sync status
 */
export function getAutoSyncStatus() {
  return autoSyncService.getStatus()
}

/**
 * Pause auto-sync during AI streaming to avoid UI disruption.
 * Call resumeAutoSyncAfterStreaming() when streaming completes.
 */
export function pauseAutoSyncForStreaming(): void {
  autoSyncService.pauseForStreaming()
}

/**
 * Resume auto-sync after AI streaming completes.
 */
export function resumeAutoSyncAfterStreaming(): void {
  autoSyncService.resumeAfterStreaming()
}
