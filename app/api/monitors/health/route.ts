import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/monitors/health?monitorId=xxx&limit=50
// Returns recent health check results for a specific monitor
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const monitorId = searchParams.get('monitorId')
    const limit = parseInt(searchParams.get('limit') || '50')

    if (!monitorId) {
      return NextResponse.json({ error: 'monitorId is required' }, { status: 400 })
    }

    // Verify the monitor belongs to this user
    const { data: monitor } = await supabase
      .from('monitors')
      .select('id')
      .eq('id', monitorId)
      .eq('user_id', user.id)
      .single()

    if (!monitor) {
      return NextResponse.json({ error: 'Monitor not found' }, { status: 404 })
    }

    const { data: checks, error } = await supabase
      .from('health_checks')
      .select('*')
      .eq('monitor_id', monitorId)
      .neq('status', 'pending')
      .order('checked_at', { ascending: false })
      .limit(limit)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ checks: checks || [] })
  } catch (error) {
    console.error('Error fetching health checks:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
