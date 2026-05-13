"use client"

import { useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { Loader2 } from "lucide-react"

export default function InviteTokenPage() {
  const router = useRouter()
  const params = useParams()
  const token = params.token as string

  useEffect(() => {
    if (token) {
      router.replace(`/invite/accept?token=${token}`)
    }
  }, [token, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-orange-500" />
        <p className="text-gray-400">Loading invitation...</p>
      </div>
    </div>
  )
}
