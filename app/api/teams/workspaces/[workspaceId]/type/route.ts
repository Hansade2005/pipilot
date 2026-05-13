import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/teams/workspaces/[workspaceId]/type
// Quick check if workspace is team or personal
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params
  const supabase = await createClient()

  try {
    const { data } = await supabase
      .from('team_workspaces')
      .select('id')
      .eq('id', workspaceId)
      .single()

    return NextResponse.json({
      isTeam: !!data,
      workspaceId
    })
  } catch (error) {
    console.error('Error checking workspace type:', error)
    return NextResponse.json({
      isTeam: false,
      workspaceId
    })
  }
}
