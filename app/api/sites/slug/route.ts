import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

// Agent Cloud Supabase — sites table lives here
const agentCloudSupabase = createClient(
  'https://dlunpilhklsgvkegnnlp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsdW5waWxoa2xzZ3ZrZWdubmxwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTA1MDQxOSwiZXhwIjoyMDcwNjI2NDE5fQ.k-2OJ4p3hr9feR4ks54OQM2HhOhaVJ3pUK-20tGJwpo'
)

// GET /api/sites/slug?projectId=xxx
// Returns the actual deployed slug for a project from the sites table
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId')
  if (!projectId) {
    return Response.json({ error: 'projectId required' }, { status: 400 })
  }

  const { data, error } = await agentCloudSupabase
    .from('sites')
    .select('project_slug')
    .eq('project_id', projectId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return Response.json({ slug: null })
  }

  return Response.json({ slug: data.project_slug })
}
