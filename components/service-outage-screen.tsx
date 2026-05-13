"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { AlertTriangle, RefreshCw, ExternalLink, Activity, Wifi, Database, ShieldAlert, Coins } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useServiceStatus, type OutageKind } from "@/components/service-status-provider"

const KIND_COPY: Record<OutageKind, { title: string; subtitle: string; Icon: React.ComponentType<{ className?: string }> }> = {
  quota: {
    title: "We've hit a usage limit",
    subtitle: "Our backend is temporarily over its monthly quota. Service will resume automatically once the cycle resets.",
    Icon: Coins,
  },
  storage: {
    title: "Storage capacity reached",
    subtitle: "Cleaning up storage to bring everything back online. Please hold tight.",
    Icon: Database,
  },
  auth: {
    title: "Authentication paused",
    subtitle: "We're verifying credentials with the auth service. This usually clears within a moment.",
    Icon: ShieldAlert,
  },
  database: {
    title: "Database is catching its breath",
    subtitle: "Our database had a brief hiccup. We're reconnecting now.",
    Icon: Database,
  },
  network: {
    title: "Connection trouble",
    subtitle: "Couldn't reach our servers. Check your internet, then we'll retry automatically.",
    Icon: Wifi,
  },
  unknown: {
    title: "Something's off on our end",
    subtitle: "We're investigating. Service will return as soon as it's resolved.",
    Icon: AlertTriangle,
  },
}

function useElapsed(since?: string) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  if (!since) return null
  const seconds = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  return `${Math.floor(seconds / 3600)}h ago`
}

export function ServiceOutageScreen() {
  const { status, kind, message, http, lastCheckedAt, recheck } = useServiceStatus()
  const [retrying, setRetrying] = useState(false)
  const elapsed = useElapsed(lastCheckedAt)

  if (status === 'healthy') return null

  const copy = KIND_COPY[kind ?? 'unknown']
  const { Icon } = copy

  const onRetry = async () => {
    setRetrying(true)
    try { await recheck() } finally { setTimeout(() => setRetrying(false), 600) }
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="outage-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-auto bg-gradient-to-br from-orange-950 via-gray-950 to-gray-900 p-6"
    >
      {/* Decorative glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-orange-600/15 blur-3xl" />
      </div>

      <div className="relative w-full max-w-xl rounded-3xl border border-orange-500/20 bg-gray-900/80 p-8 shadow-2xl shadow-orange-500/10 backdrop-blur-sm md:p-10">
        {/* Logo + status pill */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative h-9 w-9 overflow-hidden rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 p-1.5 shadow-lg shadow-orange-500/30">
              <Image src="/logo.png" alt="PiPilot" fill className="object-contain" />
            </div>
            <span className="text-sm font-semibold text-gray-100">PiPilot</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
            </span>
            Service interruption
          </div>
        </div>

        {/* Icon */}
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500/20 to-orange-600/10 ring-1 ring-orange-500/30">
          <Icon className="h-8 w-8 text-orange-400" />
        </div>

        {/* Headline */}
        <h1 id="outage-title" className="mb-3 text-3xl font-bold tracking-tight text-gray-100 md:text-4xl">
          {copy.title}
        </h1>
        <p className="mb-8 text-base leading-relaxed text-gray-300">
          {copy.subtitle}
        </p>

        {/* Actions */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          <Button
            onClick={onRetry}
            disabled={retrying}
            className="bg-orange-600 text-white shadow-lg shadow-orange-500/20 transition-all hover:bg-orange-500 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${retrying ? 'animate-spin' : ''}`} />
            {retrying ? 'Checking…' : 'Try again'}
          </Button>
          <Button
            variant="outline"
            asChild
            className="border-orange-500/50 text-orange-400 hover:bg-orange-500/10 hover:text-orange-300 hover:border-orange-500"
          >
            <a href="https://status.supabase.com" target="_blank" rel="noopener noreferrer">
              <Activity className="mr-2 h-4 w-4" />
              Status page
              <ExternalLink className="ml-2 h-3 w-3" />
            </a>
          </Button>
        </div>

        {/* Diagnostic details */}
        <div className="rounded-xl border border-gray-800/60 bg-gray-950/40 p-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
            Diagnostics
          </div>
          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Type</dt>
              <dd className="font-mono text-gray-300">{kind ?? 'unknown'}</dd>
            </div>
            {http ? (
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">HTTP</dt>
                <dd className="font-mono text-gray-300">{http}</dd>
              </div>
            ) : null}
            {message ? (
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Message</dt>
                <dd className="max-w-[60%] truncate font-mono text-right text-gray-300" title={message}>
                  {message}
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Last check</dt>
              <dd className="font-mono text-gray-300">{elapsed ?? '—'}</dd>
            </div>
          </dl>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-gray-500">
          We auto-retry every 10 seconds. This screen will close as soon as service returns.
        </p>
      </div>
    </div>
  )
}
