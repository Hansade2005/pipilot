import { useEffect, useRef } from 'react'

/**
 * Auto-creates a monitor when a project gets a deployment URL for the first time.
 * Checks if a monitor already exists for this project before creating one.
 */
export function useAutoMonitor(
  projectId: string | undefined,
  projectName: string | undefined,
  deploymentUrl: string | undefined
) {
  const hasChecked = useRef<string | null>(null)

  useEffect(() => {
    if (!projectId || !deploymentUrl || !projectName) return
    // Only check once per project+url combo
    const key = `${projectId}:${deploymentUrl}`
    if (hasChecked.current === key) return
    hasChecked.current = key

    const autoCreateMonitor = async () => {
      try {
        // Check if a monitor already exists for this project
        const response = await fetch(`/api/monitors?projectId=${projectId}`)
        if (!response.ok) return

        const data = await response.json()
        const monitors = data.monitors || []

        // If there's already a monitor for this URL, skip
        if (monitors.some((m: any) => m.url === deploymentUrl)) return

        // Auto-create the monitor
        await fetch('/api/monitors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: projectName,
            url: deploymentUrl,
            projectId,
            isAuto: true,
          })
        })

        console.log(`[AppCare] Auto-created monitor for ${projectName} at ${deploymentUrl}`)
      } catch (error) {
        // Silently fail - auto-monitor is a nice-to-have
        console.error('[AppCare] Failed to auto-create monitor:', error)
      }
    }

    autoCreateMonitor()
  }, [projectId, projectName, deploymentUrl])
}
