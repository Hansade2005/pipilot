"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { usePageTitle } from '@/hooks/use-page-title'

export default function AgentCloudPage() {
  usePageTitle('Agent Cloud')
  const router = useRouter()

  useEffect(() => {
    // Redirect to new session page
    router.replace('/agent-cloud/new')
  }, [router])

  return null
}
