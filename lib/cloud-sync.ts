import { createClient } from "@/lib/supabase/client"
import { storageManager } from "@/lib/storage-manager"
import { getByokConfig, saveByokConfig, BYOK_STORAGE_KEYS, type ByokConfig } from "@/lib/storage-manager"

// Initialize Supabase client
const supabase = createClient()

// Maximum number of projects to sync to cloud backup
export const MAX_BACKUP_PROJECTS = 4

/**
 * Select the N most recently active workspaces and filter all related data
 * (files, chatSessions, messages, deployments, envVars) to only include
 * data belonging to those workspaces.
 */
function filterDataToTopProjects(data: any, maxProjects: number = MAX_BACKUP_PROJECTS): any {
  const workspaces: any[] = Array.isArray(data.workspaces) ? data.workspaces : []

  // Sort by lastActivity descending, pick top N
  const sortedWorkspaces = [...workspaces].sort((a, b) => {
    const dateA = new Date(a.lastActivity || a.updatedAt || a.createdAt || 0).getTime()
    const dateB = new Date(b.lastActivity || b.updatedAt || b.createdAt || 0).getTime()
    return dateB - dateA
  })
  const topWorkspaces = sortedWorkspaces.slice(0, maxProjects)
  const topWorkspaceIds = new Set(topWorkspaces.map(w => w.id))

  // Also collect chatSession IDs that belong to these workspaces
  const allChatSessions: any[] = Array.isArray(data.chatSessions) ? data.chatSessions : []
  const filteredChatSessions = allChatSessions.filter(
    (cs: any) => cs.workspaceId && topWorkspaceIds.has(cs.workspaceId)
  )
  const filteredChatSessionIds = new Set(filteredChatSessions.map((cs: any) => cs.id))

  // Filter messages to only those belonging to filtered chat sessions
  const allMessages: any[] = Array.isArray(data.messages) ? data.messages : []
  const filteredMessages = allMessages.filter(
    (m: any) => filteredChatSessionIds.has(m.chatSessionId)
  )

  // Filter workspace-scoped tables
  const filterByWorkspace = (arr: any[]) =>
    Array.isArray(arr) ? arr.filter((item: any) => topWorkspaceIds.has(item.workspaceId)) : []

  // Filter checkpoints to only those belonging to top workspaces
  const allCheckpoints: any[] = Array.isArray(data.checkpoints) ? data.checkpoints : []
  const filteredCheckpoints = allCheckpoints.filter(
    (cp: any) => cp.workspaceId && topWorkspaceIds.has(cp.workspaceId)
  )

  return {
    ...data,
    workspaces: topWorkspaces,
    files: filterByWorkspace(data.files),
    chatSessions: filteredChatSessions,
    messages: filteredMessages,
    deployments: filterByWorkspace(data.deployments),
    environmentVariables: filterByWorkspace(data.environmentVariables),
    checkpoints: filteredCheckpoints,
  }
}

/**
 * Upload current IndexedDB data to Supabase Storage as a backup
 */
export async function uploadBackupToCloud(userId: string): Promise<boolean> {
  try {
    // Initialize storage manager
    await storageManager.init()

    // Export all data from IndexedDB
    const fullData = await storageManager.exportData()

    // PROTECTION AGAINST EMPTY DATA OVERWRITING CLOUD BACKUP
    // Check if local data appears to be cleared (all arrays empty or nearly empty)
    const isLocalDataEmpty = Object.values(fullData).every((tableData: any) =>
      Array.isArray(tableData) && tableData.length === 0
    )

    if (isLocalDataEmpty) {
      // Local data appears empty, checking cloud backup

      // Check if there's existing cloud backup
      const { data: existingBackup, error: fetchError } = await supabase
        .from('user_backups')
        .select('backup_data, storage_url, created_at')
        .eq('user_id', userId)
        .single()

      if (!fetchError && (existingBackup?.backup_data || existingBackup?.storage_url)) {
        const hasCloudData = existingBackup.storage_url ||
          (existingBackup.backup_data && Object.values(existingBackup.backup_data).some((tableData: any) =>
            Array.isArray(tableData) && tableData.length > 0
          ))

        if (hasCloudData) {
          // Cloud has data but local is empty - likely storage was cleared. Skipping backup to prevent data loss.
          return false
        }
      }
    }

    // Filter to only the top N most recently active projects
    const data = filterDataToTopProjects(fullData, MAX_BACKUP_PROJECTS)

    // Include BYOK config in backup if user opted in
    const byokConfig = getByokConfig()
    if (byokConfig.backupToCloud && byokConfig.keys.length > 0) {
      data.byokConfig = byokConfig
    }

    // Create backup filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupFilename = `backup-${userId}-${timestamp}.json`

    // CLEANUP: Delete old backup file before uploading new one
    const { data: existingBackup } = await supabase
      .from('user_backups')
      .select('storage_url')
      .eq('user_id', userId)
      .single()

    if (existingBackup?.storage_url) {
      try {
        // Extract filename from storage URL
        const oldFileName = existingBackup.storage_url.split('/').pop()
        if (oldFileName && oldFileName.startsWith('backup-')) {
          await supabase.storage.from('backups').remove([oldFileName])
        }
      } catch (cleanupError) {
        // Continue with upload even if cleanup fails
      }
    }

    // Convert data to JSON blob
    const jsonString = JSON.stringify(data, null, 2)
    const blob = new Blob([jsonString], { type: 'application/json' })

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('backups')
      .upload(backupFilename, blob, {
        contentType: 'application/json',
        upsert: false
      })

    if (uploadError) {
      throw uploadError
    }

    // Get the public URL for the uploaded file
    const { data: urlData } = supabase.storage
      .from('backups')
      .getPublicUrl(backupFilename)

    if (!urlData?.publicUrl) {
      throw new Error('Failed to get public URL for uploaded backup')
    }

    // Save metadata to database
    const { error } = await supabase
      .from('user_backups')
      .upsert({
        user_id: userId,
        backup_data: null, // Clear old JSONB data
        storage_url: urlData.publicUrl,
        created_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      })

    if (error) throw error

    // Update last backup time in user settings
    const now = new Date().toISOString()
    await supabase
      .from('user_settings')
      .upsert({
        user_id: userId,
        last_backup: now,
        updated_at: now
      }, {
        onConflict: 'user_id'
      })

    // Notify other hooks/devices that a backup just completed
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pipilot-backup-completed'))
    }

    return true
  } catch (error) {
    console.error("Error uploading backup to cloud:", error)
    return false
  }
}

/**
 * Smart backup function that handles empty data scenarios
 * If local data is empty but cloud has data, it will restore from cloud instead of backing up
 */
export async function smartBackupToCloud(userId: string): Promise<boolean> {
  try {
    // Initialize storage manager
    await storageManager.init()

    // Export all data from IndexedDB
    const data = await storageManager.exportData()

    const isLocalDataEmpty = Object.values(data).every((tableData: any) =>
      Array.isArray(tableData) && tableData.length === 0
    )

    if (isLocalDataEmpty) {
      // Check if there's existing cloud backup
      const { data: existingBackup, error: fetchError } = await supabase
        .from('user_backups')
        .select('backup_data, storage_url, created_at')
        .eq('user_id', userId)
        .single()

      if (!fetchError && (existingBackup?.backup_data || existingBackup?.storage_url)) {
        let hasCloudData = false

        if (existingBackup.storage_url) {
          // For storage-based backups, we assume they have data
          hasCloudData = true
        } else if (existingBackup.backup_data) {
          const cloudData = existingBackup.backup_data
          hasCloudData = Object.values(cloudData).some((tableData: any) =>
            Array.isArray(tableData) && tableData.length > 0
          )
        }

        if (hasCloudData) {
          // Automatically restore from cloud to prevent data loss
          return await restoreBackupFromCloud(userId)
        }
      }
    }

    // Normal backup process
    return await uploadBackupToCloud(userId)
  } catch (error) {
    console.error("Error in smart backup:", error)
    return false
  }
}/**
 * Download the latest backup from Supabase and merge it with local IndexedDB data.
 *
 * Merge strategy:
 * - For each workspace (project) in the cloud backup, overwrite the local version
 *   of that workspace and all its related data (files, chatSessions, messages,
 *   deployments, environmentVariables).
 * - Local-only workspaces (not present in the cloud backup) are left untouched.
 * - Non-workspace-scoped tables (e.g. tokens, templates) are imported from cloud
 *   only if they don't already exist locally.
 */
export async function restoreBackupFromCloud(userId: string): Promise<boolean> {
  try {
    // Fetch the latest backup from Supabase
    const { data, error } = await supabase
      .from('user_backups')
      .select('backup_data, storage_url')
      .eq('user_id', userId)
      .single()

    if (error) {
      throw error
    }
    if (!data) {
      return false
    }

    let backupData: any = null

    // Handle new storage-based backups
    if (data.storage_url) {
      try {
        // Extract filename from storage URL
        const filename = data.storage_url.split('/').pop()
        if (!filename) {
          throw new Error('Invalid storage URL: could not extract filename')
        }

        // Use Supabase storage client to download (works regardless of bucket privacy)
        const { data: fileData, error: dlError } = await supabase.storage
          .from('backups')
          .download(filename)

        if (dlError || !fileData) {
          // Fallback: try a signed URL
          const { data: signedData, error: signError } = await supabase.storage
            .from('backups')
            .createSignedUrl(filename, 60)

          if (signError || !signedData?.signedUrl) {
            throw new Error(`Failed to download backup: ${dlError?.message || signError?.message || 'unknown error'}`)
          }

          const response = await fetch(signedData.signedUrl)
          if (!response.ok) {
            throw new Error(`Failed to download backup: ${response.status} ${response.statusText}`)
          }
          const jsonString = await response.text()
          backupData = JSON.parse(jsonString)
        } else {
          const jsonString = await fileData.text()
          backupData = JSON.parse(jsonString)
        }
      } catch (downloadError) {
        throw downloadError
      }
    }
    // Handle legacy JSONB backups
    else if (data.backup_data) {
      backupData = data.backup_data
    }
    else {
      return false
    }

    // Initialize storage manager
    await storageManager.init()

    // Export current local data for merging
    const localData = await storageManager.exportData()

    // Build set of workspace IDs from cloud backup
    const cloudWorkspaces: any[] = Array.isArray(backupData.workspaces) ? backupData.workspaces : []
    const cloudWorkspaceIds = new Set(cloudWorkspaces.map((w: any) => w.id))

    // Build set of cloud chat session IDs (scoped to cloud workspaces)
    const cloudChatSessions: any[] = Array.isArray(backupData.chatSessions) ? backupData.chatSessions : []
    const cloudChatSessionIds = new Set(cloudChatSessions.map((cs: any) => cs.id))

    // --- Merge workspace-scoped tables ---
    // Strategy: keep local items that DON'T belong to any cloud workspace,
    //           then add ALL cloud items for those workspaces.

    const localWorkspaces: any[] = Array.isArray(localData.workspaces) ? localData.workspaces : []
    const localFiles: any[] = Array.isArray(localData.files) ? localData.files : []
    const localChatSessions: any[] = Array.isArray(localData.chatSessions) ? localData.chatSessions : []
    const localMessages: any[] = Array.isArray(localData.messages) ? localData.messages : []
    const localDeployments: any[] = Array.isArray(localData.deployments) ? localData.deployments : []
    const localEnvVars: any[] = Array.isArray(localData.environmentVariables) ? localData.environmentVariables : []
    const localCheckpoints: any[] = Array.isArray(localData.checkpoints) ? localData.checkpoints : []

    // Collect local chatSession IDs that belong to cloud workspaces (these will be replaced)
    const localChatSessionIdsToReplace = new Set(
      localChatSessions
        .filter((cs: any) => cs.workspaceId && cloudWorkspaceIds.has(cs.workspaceId))
        .map((cs: any) => cs.id)
    )

    // Workspaces: keep local-only, replace cloud ones
    const mergedWorkspaces = [
      ...localWorkspaces.filter((w: any) => !cloudWorkspaceIds.has(w.id)),
      ...cloudWorkspaces
    ]

    // Files: keep local files from non-cloud workspaces, use cloud files for cloud workspaces
    const cloudFiles: any[] = Array.isArray(backupData.files) ? backupData.files : []
    const mergedFiles = [
      ...localFiles.filter((f: any) => !cloudWorkspaceIds.has(f.workspaceId)),
      ...cloudFiles
    ]

    // ChatSessions: keep local sessions from non-cloud workspaces, use cloud sessions
    const mergedChatSessions = [
      ...localChatSessions.filter((cs: any) => !cs.workspaceId || !cloudWorkspaceIds.has(cs.workspaceId)),
      ...cloudChatSessions
    ]

    // Messages: keep local messages not belonging to replaced sessions, add cloud messages
    const cloudMessages: any[] = Array.isArray(backupData.messages) ? backupData.messages : []
    const mergedMessages = [
      ...localMessages.filter((m: any) => !localChatSessionIdsToReplace.has(m.chatSessionId) && !cloudChatSessionIds.has(m.chatSessionId)),
      ...cloudMessages
    ]

    // Deployments: keep local deployments from non-cloud workspaces
    const cloudDeployments: any[] = Array.isArray(backupData.deployments) ? backupData.deployments : []
    const mergedDeployments = [
      ...localDeployments.filter((d: any) => !cloudWorkspaceIds.has(d.workspaceId)),
      ...cloudDeployments
    ]

    // Environment variables: keep local ones from non-cloud workspaces
    const cloudEnvVars: any[] = Array.isArray(backupData.environmentVariables) ? backupData.environmentVariables : []
    const mergedEnvVars = [
      ...localEnvVars.filter((ev: any) => !cloudWorkspaceIds.has(ev.workspaceId)),
      ...cloudEnvVars
    ]

    // Checkpoints: keep local ones from non-cloud workspaces, use cloud checkpoints for cloud workspaces
    const cloudCheckpoints: any[] = Array.isArray(backupData.checkpoints) ? backupData.checkpoints : []
    const mergedCheckpoints = [
      ...localCheckpoints.filter((cp: any) => !cloudWorkspaceIds.has(cp.workspaceId)),
      ...cloudCheckpoints
    ]

    // --- Clear and re-import all data ---
    await storageManager.clearAll()

    // Import merged workspace-scoped tables
    const tablesToImport: Record<string, any[]> = {
      workspaces: mergedWorkspaces,
      files: mergedFiles,
      chatSessions: mergedChatSessions,
      messages: mergedMessages,
      deployments: mergedDeployments,
      environmentVariables: mergedEnvVars,
      checkpoints: mergedCheckpoints,
    }

    for (const [tableName, tableData] of Object.entries(tablesToImport)) {
      if (tableData.length > 0) {
        try {
          await storageManager.importTable(tableName, tableData)
        } catch (importError) {
          console.error(`Error importing merged ${tableName}:`, importError)
        }
      }
    }

    // Restore BYOK config from cloud backup if present
    if (backupData.byokConfig && typeof backupData.byokConfig === 'object') {
      try {
        const cloudByokConfig = backupData.byokConfig as ByokConfig
        const localByokConfig = getByokConfig()
        // Only restore if local has no keys configured (don't overwrite existing local keys)
        if (localByokConfig.keys.length === 0 && cloudByokConfig.keys.length > 0) {
          saveByokConfig(cloudByokConfig)
          console.log(`Restored BYOK config with ${cloudByokConfig.keys.length} keys from cloud backup`)
        }
      } catch (byokError) {
        console.error('Error restoring BYOK config:', byokError)
      }
    }

    // Import non-workspace-scoped tables from cloud (tokens, templates, etc.)
    // Only import items that don't conflict with existing local data
    const workspaceScopedTables = new Set([
      'workspaces', 'files', 'chatSessions', 'messages', 'deployments', 'environmentVariables', 'checkpoints', 'byokConfig'
    ])

    for (const [tableName, tableData] of Object.entries(backupData)) {
      if (workspaceScopedTables.has(tableName)) continue
      if (!Array.isArray(tableData) || tableData.length === 0) continue

      // For non-workspace tables, merge by ID (cloud items fill gaps)
      const localTableData: any[] = Array.isArray((localData as any)[tableName])
        ? (localData as any)[tableName]
        : []
      const localIds = new Set(localTableData.map((item: any) => item.id))
      const mergedTable = [
        ...localTableData,
        ...(tableData as any[]).filter((item: any) => !localIds.has(item.id))
      ]

      if (mergedTable.length > 0) {
        try {
          await storageManager.importTable(tableName, mergedTable)
        } catch (importError) {
          console.error(`Error importing ${tableName}:`, importError)
        }
      }
    }

    return true
  } catch (error) {
    console.error("Error restoring backup from cloud:", error)
    return false
  }
}

/**
 * Check if cloud sync is enabled for the user
 */
export async function isCloudSyncEnabled(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('cloud_sync_enabled')
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
      throw error
    }

    return data?.cloud_sync_enabled || false
  } catch (error) {
    return false
  }
}

/**
 * Enable or disable cloud sync for the user
 */
export async function setCloudSyncEnabled(userId: string, enabled: boolean): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: userId,
        cloud_sync_enabled: enabled,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      })

    if (error) throw error

    return true
  } catch (error) {
    console.error("Error setting cloud sync status:", error)
    return false
  }
}

/**
 * Get the timestamp of the last backup
 */
export async function getLastBackupTime(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('last_backup')
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
      throw error
    }

    return data?.last_backup || null
  } catch (error) {
    console.error("Error getting last backup time:", error)
    return null
  }
}

/**
 * Store deployment tokens for a user
 */
export async function storeDeploymentTokens(
  userId: string, 
  tokens: {
    github?: string, 
    vercel?: string, 
    netlify?: string,
    supabase?: string,
    supabase_refresh_token?: string,
    supabase_token_expires_at?: string,
    supabase_project_url?: string,
    supabase_anon_key?: string,
    supabase_service_role_key?: string,
    stripe?: string
  }
): Promise<boolean> {
  try {
    // Build update object with only the provided tokens
    const updateData: any = {
      user_id: userId,
      updated_at: new Date().toISOString()
    }
    
    // Only update the tokens that are explicitly provided
    if (tokens.github !== undefined) updateData.github_token = tokens.github
    if (tokens.vercel !== undefined) updateData.vercel_token = tokens.vercel  
    if (tokens.netlify !== undefined) updateData.netlify_token = tokens.netlify
    if (tokens.supabase !== undefined) updateData.supabase_token = tokens.supabase
    if (tokens.supabase_refresh_token !== undefined) updateData.supabase_refresh_token = tokens.supabase_refresh_token
    if (tokens.supabase_token_expires_at !== undefined) updateData.supabase_token_expires_at = tokens.supabase_token_expires_at
    if (tokens.supabase_project_url !== undefined) updateData.supabase_project_url = tokens.supabase_project_url
    if (tokens.supabase_anon_key !== undefined) updateData.supabase_anon_key = tokens.supabase_anon_key
    if (tokens.supabase_service_role_key !== undefined) updateData.supabase_service_role_key = tokens.supabase_service_role_key
    if (tokens.stripe !== undefined) updateData.stripe_secret_key = tokens.stripe

    const { error } = await supabase
      .from('user_settings')
      .upsert(updateData, {
        onConflict: 'user_id'
      })

    if (error) throw error

    return true
  } catch (error) {
    console.error("Error storing deployment tokens:", error)
    return false
  }
}

/**
 * Retrieve deployment tokens for a user
 */
export async function getDeploymentTokens(userId: string): Promise<{
  github?: string, 
  vercel?: string, 
  netlify?: string,
  supabase?: string,
  supabase_refresh_token?: string,
  supabase_token_expires_at?: string,
  supabase_project_url?: string,
  supabase_anon_key?: string,
  supabase_service_role_key?: string,
  stripe?: string
} | null> {
  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('github_token, vercel_token, netlify_token, supabase_token, supabase_refresh_token, supabase_token_expires_at, supabase_project_url, supabase_anon_key, supabase_service_role_key, stripe_secret_key')
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
      throw error
    }

    return data ? {
      github: data.github_token || undefined,
      vercel: data.vercel_token || undefined,
      netlify: data.netlify_token || undefined,
      supabase: data.supabase_token || undefined,
      supabase_refresh_token: data.supabase_refresh_token || undefined,
      supabase_token_expires_at: data.supabase_token_expires_at || undefined,
      supabase_project_url: data.supabase_project_url || undefined,
      supabase_anon_key: data.supabase_anon_key || undefined,
      supabase_service_role_key: data.supabase_service_role_key || undefined,
      stripe: data.stripe_secret_key || undefined
    } : null
  } catch (error) {
    console.error("Error retrieving deployment tokens:", error)
    return null
  }
}

/**
 * Store deployment connection states for a user
 */
export async function storeDeploymentConnectionStates(
  userId: string, 
  states: {
    github_connected?: boolean,
    vercel_connected?: boolean,
    netlify_connected?: boolean,
    supabase_connected?: boolean,
    stripe_connected?: boolean
  }
): Promise<boolean> {
  try {
    const updateData: any = {
      user_id: userId,
      updated_at: new Date().toISOString()
    }
    
    if (states.github_connected !== undefined) updateData.github_connected = states.github_connected
    if (states.vercel_connected !== undefined) updateData.vercel_connected = states.vercel_connected
    if (states.netlify_connected !== undefined) updateData.netlify_connected = states.netlify_connected
    if (states.supabase_connected !== undefined) updateData.supabase_connected = states.supabase_connected
    if (states.stripe_connected !== undefined) updateData.stripe_connected = states.stripe_connected

    const { error } = await supabase
      .from('user_settings')
      .upsert(updateData, {
        onConflict: 'user_id'
      })

    if (error) throw error

    return true
  } catch (error) {
    console.error("Error storing deployment connection states:", error)
    return false
  }
}

/**
 * Retrieve deployment connection states for a user
 */
export async function getDeploymentConnectionStates(userId: string): Promise<{
  github_connected?: boolean,
  vercel_connected?: boolean,
  netlify_connected?: boolean,
  supabase_connected?: boolean,
  stripe_connected?: boolean
} | null> {
  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('github_connected, vercel_connected, netlify_connected, supabase_connected, stripe_connected')
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
      throw error
    }

    return data ? {
      github_connected: data.github_connected || false,
      vercel_connected: data.vercel_connected || false,
      netlify_connected: data.netlify_connected || false,
      supabase_connected: data.supabase_connected || false,
      stripe_connected: data.stripe_connected || false
    } : null
  } catch (error) {
    console.error("Error retrieving deployment connection states:", error)
    return null
  }
}
export async function storeSupabaseProjectDetails(
  userId: string,
  projectDetails: {
    projectUrl?: string,
    anonKey?: string,
    serviceRoleKey?: string,
    selectedProjectId?: string,
    selectedProjectName?: string
  }
): Promise<boolean> {
  try {
    const updateData: any = {
      user_id: userId,
      updated_at: new Date().toISOString()
    }

    if (projectDetails.projectUrl !== undefined) updateData.supabase_project_url = projectDetails.projectUrl
    if (projectDetails.anonKey !== undefined) updateData.supabase_anon_key = projectDetails.anonKey
    if (projectDetails.serviceRoleKey !== undefined) updateData.supabase_service_role_key = projectDetails.serviceRoleKey
    if (projectDetails.selectedProjectId !== undefined) updateData.supabase_selected_project_id = projectDetails.selectedProjectId
    if (projectDetails.selectedProjectName !== undefined) updateData.supabase_selected_project_name = projectDetails.selectedProjectName

    const { error } = await supabase
      .from('user_settings')
      .upsert(updateData, {
        onConflict: 'user_id'
      })

    if (error) throw error

    return true
  } catch (error) {
    console.error("Error storing Supabase project details:", error)
    return false
  }
}

/**
 * Retrieve Supabase project details for a user
 */
export async function getSupabaseProjectDetails(userId: string): Promise<{
  projectUrl?: string,
  anonKey?: string,
  serviceRoleKey?: string,
  selectedProjectId?: string,
  selectedProjectName?: string
} | null> {
  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('supabase_project_url, supabase_anon_key, supabase_service_role_key, supabase_selected_project_id, supabase_selected_project_name')
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
      throw error
    }

    return data ? {
      projectUrl: data.supabase_project_url || undefined,
      anonKey: data.supabase_anon_key || undefined,
      serviceRoleKey: data.supabase_service_role_key || undefined,
      selectedProjectId: data.supabase_selected_project_id || undefined,
      selectedProjectName: data.supabase_selected_project_name || undefined
    } : null
  } catch (error) {
    console.error("Error retrieving Supabase project details:", error)
    return null
  }
}

/**
 * Connect a PixelPilot project to a Supabase project
 */
export async function connectPixelPilotToSupabaseProject(
  userId: string,
  pixelpilotProjectId: string,
  supabaseProjectDetails: {
    supabaseProjectId: string,
    supabaseProjectName: string,
    supabaseProjectUrl?: string,
    supabaseAnonKey?: string,
    supabaseServiceRoleKey?: string
  },
  forceConnect: boolean = false
): Promise<{ success: boolean; conflict?: { existingProjectId: string }; error?: string }> {
  try {
    // Check if this Supabase project is already connected to a different PixelPilot project
    if (!forceConnect) {
      const { data: existingConnection } = await supabase
        .from('supabase_projects')
        .select('pixelpilot_project_id')
        .eq('user_id', userId)
        .eq('supabase_project_id', supabaseProjectDetails.supabaseProjectId)
        .single()

      if (existingConnection && existingConnection.pixelpilot_project_id !== pixelpilotProjectId) {
        return {
          success: false,
          conflict: {
            existingProjectId: existingConnection.pixelpilot_project_id
          }
        }
      }
    }

    const { error } = await supabase
      .from('supabase_projects')
      .upsert({
        pixelpilot_project_id: pixelpilotProjectId,
        user_id: userId,
        supabase_project_id: supabaseProjectDetails.supabaseProjectId,
        supabase_project_name: supabaseProjectDetails.supabaseProjectName,
        supabase_project_url: supabaseProjectDetails.supabaseProjectUrl,
        supabase_anon_key: supabaseProjectDetails.supabaseAnonKey,
        supabase_service_role_key: supabaseProjectDetails.supabaseServiceRoleKey,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,supabase_project_id',
        ignoreDuplicates: false
      })

    if (error) throw error

    return { success: true }
  } catch (error: any) {
    console.error("Error connecting PixelPilot project to Supabase project:", error)
    return { success: false, error: error.message || 'Unknown error' }
  }
}

/**
 * Get Supabase project connection for a PixelPilot project
 */
export async function getSupabaseProjectForPixelPilotProject(
  userId: string,
  pixelpilotProjectId: string
): Promise<{
  supabaseProjectId: string,
  supabaseProjectName: string,
  supabaseProjectUrl?: string,
  supabaseAnonKey?: string,
  supabaseServiceRoleKey?: string,
  connectedAt: string,
  updatedAt: string
} | null> {
  try {
    const { data, error } = await supabase
      .from('supabase_projects')
      .select('*')
      .eq('user_id', userId)
      .eq('pixelpilot_project_id', pixelpilotProjectId)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
      throw error
    }

    return data ? {
      supabaseProjectId: data.supabase_project_id,
      supabaseProjectName: data.supabase_project_name,
      supabaseProjectUrl: data.supabase_project_url || undefined,
      supabaseAnonKey: data.supabase_anon_key || undefined,
      supabaseServiceRoleKey: data.supabase_service_role_key || undefined,
      connectedAt: data.connected_at,
      updatedAt: data.updated_at
    } : null
  } catch (error) {
    console.error("Error retrieving Supabase project connection:", error)
    return null
  }
}

/**
 * Disconnect a PixelPilot project from its Supabase project
 */
export async function disconnectPixelPilotFromSupabaseProject(
  userId: string,
  pixelpilotProjectId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('supabase_projects')
      .delete()
      .eq('user_id', userId)
      .eq('pixelpilot_project_id', pixelpilotProjectId)

    if (error) throw error

    return true
  } catch (error) {
    console.error("Error disconnecting PixelPilot project from Supabase project:", error)
    return false
  }
}

/**
 * List all Supabase project connections for a user
 */
export async function getAllSupabaseProjectConnections(
  userId: string
): Promise<Array<{
  pixelpilotProjectId: string,
  supabaseProjectId: string,
  supabaseProjectName: string,
  supabaseProjectUrl?: string,
  connectedAt: string,
  updatedAt: string
}>> {
  try {
    const { data, error } = await supabase
      .from('supabase_projects')
      .select('pixelpilot_project_id, supabase_project_id, supabase_project_name, supabase_project_url, connected_at, updated_at')
      .eq('user_id', userId)
      .order('connected_at', { ascending: false })

    if (error) throw error

    return (data || []).map(item => ({
      pixelpilotProjectId: item.pixelpilot_project_id,
      supabaseProjectId: item.supabase_project_id,
      supabaseProjectName: item.supabase_project_name,
      supabaseProjectUrl: item.supabase_project_url || undefined,
      connectedAt: item.connected_at,
      updatedAt: item.updated_at
    }))
  } catch (error) {
    console.error("Error retrieving Supabase project connections:", error)
    return []
  }
}

/**
 * Check if Supabase access token is expired or about to expire
 */
export async function isSupabaseTokenExpired(userId: string): Promise<boolean> {
  try {
    const tokens = await getDeploymentTokens(userId)
    if (!tokens?.supabase_token_expires_at) {
      return true // Consider expired if no expiration time
    }

    const expiresAt = new Date(tokens.supabase_token_expires_at)
    const now = new Date()

    // Consider expired if less than 5 minutes remaining
    return expiresAt.getTime() - now.getTime() < 5 * 60 * 1000
  } catch (error) {
    console.error("Error checking token expiration:", error)
    return true // Consider expired on error
  }
}

/**
 * Refresh Supabase access token using the refresh token
 */
export async function refreshSupabaseToken(userId: string): Promise<boolean> {
  try {
    const tokens = await getDeploymentTokens(userId)
    if (!tokens?.supabase_refresh_token) {
      return false
    }

    // Call the Supabase Edge Function to refresh the token
    const { data, error } = await supabase.functions.invoke('auto-refresh-tokens', {
      body: { userId, forceRefresh: true }
    })

    if (error) {
      return false
    }

    if (!data.success) {
      return false
    }

    return true

  } catch (error) {
    return false
  }
}

/**
 * Get a valid Supabase access token, refreshing if necessary
 */
export async function getValidSupabaseToken(userId: string): Promise<string | null> {
  try {
    // Check if current token is still valid
    const isExpired = await isSupabaseTokenExpired(userId)

    if (isExpired) {
      const refreshSuccess = await refreshSupabaseToken(userId)
      if (!refreshSuccess) {
        return null
      }
    }

    // Get the (potentially refreshed) token
    const tokens = await getDeploymentTokens(userId)
    return tokens?.supabase || null

  } catch (error) {
    return null
  }
}

/**
 * Get the Supabase Management API access token for the current user
 * This is used by AI tools to authenticate with Supabase Management API
 * Automatically refreshes the token if it's expired or about to expire
 */
export async function getSupabaseAccessToken(): Promise<string | null> {
  try {
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return null
    }

    // Get a valid (potentially refreshed) access token
    return await getValidSupabaseToken(user.id)
  } catch (error) {
    return null
  }
}

/**
 * Upload large payload data to Supabase Storage and return the public URL
 * Used for bypassing size limits in API requests (GitHub deploy, chat, etc.)
 */
export async function uploadLargePayload(
  data: any,
  payloadType: 'github-deploy' | 'chat-files' | 'template' | 'backup',
  userId: string,
  metadata?: Record<string, any>
): Promise<string | null> {
  try {
    // Create unique filename with timestamp and type
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `${payloadType}-${userId}-${timestamp}.json`

    // Convert data to JSON string and check size
    const jsonString = JSON.stringify(data, null, 2)
    const blob = new Blob([jsonString], { type: 'application/json' })

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('temp-payloads') // Use dedicated bucket for temporary payloads
      .upload(filename, blob, {
        contentType: 'application/json',
        upsert: false
      })

    if (uploadError) {
      throw uploadError
    }

    // Get the public URL for the uploaded file
    const { data: urlData } = supabase.storage
      .from('temp-payloads')
      .getPublicUrl(filename)

    if (!urlData?.publicUrl) {
      throw new Error('Failed to get public URL for uploaded payload')
    }

    // Store metadata in database for tracking and cleanup
    const { error: dbError } = await supabase
      .from('temp_payloads')
      .insert({
        user_id: userId,
        payload_type: payloadType,
        storage_url: urlData.publicUrl,
        filename: filename,
        size_bytes: blob.size,
        metadata: metadata || {},
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
      })

    // Don't fail the upload if metadata storage fails

    return urlData.publicUrl
  } catch (error) {
    return null
  }
}

/**
 * Download and parse payload from Supabase Storage URL
 * Used by API routes to retrieve large payloads that were uploaded to bypass size limits
 */
export async function downloadLargePayload(storageUrl: string): Promise<any | null> {
  try {
    // Fetch the data from storage
    const response = await fetch(storageUrl)
    if (!response.ok) {
      throw new Error(`Failed to download payload: ${response.status}`)
    }

    const jsonString = await response.text()
    const data = JSON.parse(jsonString)

    return data
  } catch (error) {
    return null
  }
}

/**
 * Clean up temporary payload from storage after processing
 * Should be called after the payload has been processed by the API
 */
export async function cleanupLargePayload(storageUrl: string): Promise<boolean> {
  try {
    // Extract filename from URL
    const filename = storageUrl.split('/').pop()
    if (!filename) {
      return false
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from('temp-payloads')
      .remove([filename])

    // Delete metadata from database
    const { error: dbError } = await supabase
      .from('temp_payloads')
      .delete()
      .eq('storage_url', storageUrl)

    return true
  } catch (error) {
    return false
  }
}