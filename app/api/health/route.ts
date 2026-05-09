import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type HealthStatus = {
  ok: boolean
  status: 'healthy' | 'degraded' | 'down'
  kind?: 'quota' | 'storage' | 'auth' | 'database' | 'network' | 'unknown'
  message?: string
  http?: number
  checkedAt: string
}

export async function GET() {
  const checkedAt = new Date().toISOString()

  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('system_settings')
      .select('id', { head: true, count: 'exact' })
      .limit(1)

    if (!error) {
      return NextResponse.json<HealthStatus>(
        { ok: true, status: 'healthy', checkedAt },
        { status: 200 }
      )
    }

    const msg = (error.message || '').toLowerCase()
    const code = (error as { code?: string; status?: number }).status
    let kind: HealthStatus['kind'] = 'unknown'
    if (code === 402 || msg.includes('quota') || msg.includes('exceeded') || msg.includes('payment required')) kind = 'quota'
    else if (msg.includes('storage')) kind = 'storage'
    else if (code === 401 || msg.includes('jwt') || msg.includes('auth')) kind = 'auth'
    else if (code && code >= 500) kind = 'database'

    return NextResponse.json<HealthStatus>(
      { ok: false, status: 'down', kind, message: error.message, http: code, checkedAt },
      { status: 503 }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json<HealthStatus>(
      { ok: false, status: 'down', kind: 'network', message, checkedAt },
      { status: 503 }
    )
  }
}
