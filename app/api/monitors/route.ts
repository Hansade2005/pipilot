import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/monitors - List all monitors for authenticated user
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    let query = supabase
      .from('monitors')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (projectId) {
      query = query.eq('project_id', projectId)
    }

    const { data: monitors, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ monitors: monitors || [] })
  } catch (error) {
    console.error('Error fetching monitors:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/monitors - Create a new monitor
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, url, projectId, checkInterval, isAuto } = body

    if (!name || !url) {
      return NextResponse.json({ error: 'Name and URL are required' }, { status: 400 })
    }

    // Validate URL
    try {
      new URL(url)
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 })
    }

    // Check monitor limit (free: 3, creator: 10, collaborate: 25, scale: 50)
    const { data: wallet } = await supabase
      .from('wallet')
      .select('current_plan')
      .eq('user_id', user.id)
      .single()

    const plan = wallet?.current_plan || 'free'
    const limits: Record<string, number> = { free: 3, creator: 10, collaborate: 25, scale: 50 }
    const maxMonitors = limits[plan] || 3

    const { count } = await supabase
      .from('monitors')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if ((count || 0) >= maxMonitors) {
      return NextResponse.json({
        error: `Monitor limit reached (${maxMonitors} for ${plan} plan). Upgrade to add more.`
      }, { status: 403 })
    }

    // Set check interval based on plan (free: 15min, paid: 5min)
    const intervalMinutes = checkInterval || (plan === 'free' ? 15 : 5)

    const { data: monitor, error } = await supabase
      .from('monitors')
      .insert({
        user_id: user.id,
        project_id: projectId || null,
        name,
        url,
        check_interval_minutes: intervalMinutes,
        is_auto: isAuto || false,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ monitor }, { status: 201 })
  } catch (error) {
    console.error('Error creating monitor:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/monitors - Delete a monitor
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const monitorId = searchParams.get('id')

    if (!monitorId) {
      return NextResponse.json({ error: 'Monitor ID is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('monitors')
      .delete()
      .eq('id', monitorId)
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting monitor:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/monitors - Toggle monitor active/inactive
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { id, is_active } = body

    if (!id) {
      return NextResponse.json({ error: 'Monitor ID is required' }, { status: 400 })
    }

    const { data: monitor, error } = await supabase
      .from('monitors')
      .update({ is_active, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ monitor })
  } catch (error) {
    console.error('Error updating monitor:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
