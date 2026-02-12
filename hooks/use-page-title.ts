"use client"

import { useEffect } from "react"

const DEFAULT_TITLE = "PiPilot - Canada's First Agentic Vibe Coding Platform | AI App Builder"

/**
 * Sets the browser tab title for client component pages.
 * Restores the default PiPilot title on unmount.
 */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} | PiPilot`
    return () => {
      document.title = DEFAULT_TITLE
    }
  }, [title])
}
