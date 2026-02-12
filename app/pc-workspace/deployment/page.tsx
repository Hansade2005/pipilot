"use client"

import React, { Suspense } from "react"
// Prevent static prerendering; this page relies on client-side navigation hooks
export const dynamic = 'force-dynamic'
import { Loader2 } from "lucide-react"
import PcDeploymentClient from "@/components/workspace/pc-deployment-client"
import { usePageTitle } from '@/hooks/use-page-title'

function DeploymentPageContent() {
  return <PcDeploymentClient />
}

export default function DeploymentPage() {
  usePageTitle('Deployment')
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Enhanced Gradient Background */}
      <div className="absolute inset-0 lovable-gradient" />
      
      {/* Noise Texture Overlay */}
      <div className="absolute inset-0 noise-texture" />

      <div className="relative z-10 pt-16 pb-24">
        <Suspense fallback={
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        }>
          <DeploymentPageContent />
        </Suspense>
      </div>
    </div>
  )
}
