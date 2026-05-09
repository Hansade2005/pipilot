"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"

export type OutageKind = 'quota' | 'storage' | 'auth' | 'database' | 'network' | 'unknown'
export type ServiceStatus = 'healthy' | 'down'

export interface ServiceStatusValue {
  status: ServiceStatus
  kind?: OutageKind
  message?: string
  http?: number
  lastCheckedAt?: string
  recheck: () => Promise<void>
  reportFailure: (info: { http?: number; message?: string; kind?: OutageKind }) => void
}

const ServiceStatusContext = createContext<ServiceStatusValue | null>(null)

const PING_INTERVAL_MS = 30_000
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

function classify(http?: number, message?: string): OutageKind {
  const m = (message || '').toLowerCase()
  if (http === 402 || m.includes('quota') || m.includes('exceeded') || m.includes('payment required')) return 'quota'
  if (m.includes('storage size')) return 'storage'
  if (http === 401 || m.includes('jwt') || m.includes('invalid api key')) return 'auth'
  if (http && http >= 500 && http < 600) return 'database'
  if (m.includes('failed to fetch') || m.includes('network')) return 'network'
  return 'unknown'
}

export function ServiceStatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ServiceStatus>('healthy')
  const [kind, setKind] = useState<OutageKind | undefined>()
  const [message, setMessage] = useState<string | undefined>()
  const [http, setHttp] = useState<number | undefined>()
  const [lastCheckedAt, setLastCheckedAt] = useState<string | undefined>()
  const consecutiveFailures = useRef(0)

  const setHealthy = useCallback(() => {
    consecutiveFailures.current = 0
    setStatus('healthy'); setKind(undefined); setMessage(undefined); setHttp(undefined)
    setLastCheckedAt(new Date().toISOString())
  }, [])

  const setDown = useCallback((info: { http?: number; message?: string; kind?: OutageKind }) => {
    setStatus('down')
    setKind(info.kind ?? classify(info.http, info.message))
    setMessage(info.message); setHttp(info.http)
    setLastCheckedAt(new Date().toISOString())
  }, [])

  const recheck = useCallback(async () => {
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('system_settings')
        .select('id', { head: true, count: 'exact' })
        .limit(1)
      if (!error) { setHealthy(); return }
      const code = (error as { code?: string; status?: number }).status
      setDown({ http: code, message: error.message })
    } catch (e) {
      setDown({ message: e instanceof Error ? e.message : 'Network error', kind: 'network' })
    }
  }, [setHealthy, setDown])

  // Two-strike rule on passive failures: avoid flickering on a single hiccup
  const reportFailure = useCallback((info: { http?: number; message?: string; kind?: OutageKind }) => {
    consecutiveFailures.current += 1
    if (consecutiveFailures.current >= 2 || info.http === 402) {
      setDown(info)
    }
  }, [setDown])

  // Active periodic ping
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const tick = async () => {
      if (cancelled) return
      await recheck()
      if (cancelled) return
      const next = status === 'down' ? 10_000 : PING_INTERVAL_MS
      timer = setTimeout(tick, next)
    }
    tick()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
    // recheck identity stable; status drives interval reset
  }, [recheck, status])

  // Passive: intercept window.fetch for Supabase calls
  useEffect(() => {
    if (typeof window === 'undefined' || !SUPABASE_URL) return
    const supabaseHost = (() => { try { return new URL(SUPABASE_URL).host } catch { return '' } })()
    if (!supabaseHost) return

    const original = window.fetch.bind(window)
    const wrapped: typeof window.fetch = async (input, init) => {
      let url = ''
      try {
        url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
      } catch {}
      const isSupabase = url && url.includes(supabaseHost)
      try {
        const res = await original(input as RequestInfo, init)
        if (isSupabase) {
          if (res.status === 402 || res.status === 503) {
            // Best-effort body read without consuming for caller
            const cloned = res.clone()
            const text = await cloned.text().catch(() => '')
            reportFailure({ http: res.status, message: text.slice(0, 200) })
          } else if (res.ok) {
            consecutiveFailures.current = 0
          }
        }
        return res
      } catch (err) {
        if (isSupabase) reportFailure({ kind: 'network', message: err instanceof Error ? err.message : 'Network error' })
        throw err
      }
    }
    window.fetch = wrapped
    return () => { window.fetch = original }
  }, [reportFailure])

  const value = useMemo<ServiceStatusValue>(() => ({
    status, kind, message, http, lastCheckedAt, recheck, reportFailure,
  }), [status, kind, message, http, lastCheckedAt, recheck, reportFailure])

  return (
    <ServiceStatusContext.Provider value={value}>
      {children}
    </ServiceStatusContext.Provider>
  )
}

export function useServiceStatus(): ServiceStatusValue {
  const ctx = useContext(ServiceStatusContext)
  if (!ctx) throw new Error('useServiceStatus must be used inside ServiceStatusProvider')
  return ctx
}
