import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  extractApiKey,
  isValidApiKeyFormat,
  hashApiKey,
  checkRateLimit,
  logApiUsage,
  updateApiKeyLastUsed,
} from '@/lib/api-keys';

// Create Supabase client with service role (bypasses RLS)
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Middleware to authenticate API key and check rate limits
 */
async function authenticateApiKey(request: Request, databaseId: string) {
  const startTime = Date.now();
  const authHeader = request.headers.get('authorization');
  const apiKey = extractApiKey(authHeader);

  if (!apiKey) {
    return {
      error: NextResponse.json(
        { error: 'Missing API key. Provide Authorization: Bearer YOUR_API_KEY header' },
        { status: 401 }
      ),
    };
  }

  if (!isValidApiKeyFormat(apiKey)) {
    return {
      error: NextResponse.json(
        { error: 'Invalid API key format' },
        { status: 401 }
      ),
    };
  }

  const keyHash = hashApiKey(apiKey);

  const { data: apiKeyRecord, error: keyError } = await getSupabaseAdmin()
    .from('api_keys')
    .select('*, databases!inner(*)')
    .eq('key_hash', keyHash)
    .eq('database_id', databaseId)
    .eq('is_active', true)
    .single();

  if (keyError || !apiKeyRecord) {
    return {
      error: NextResponse.json(
        { error: 'Invalid API key or access denied' },
        { status: 401 }
      ),
    };
  }

  const rateLimitResult = await checkRateLimit(
    apiKeyRecord.id,
    apiKeyRecord.rate_limit,
    getSupabaseAdmin()
  );

  if (rateLimitResult.exceeded) {
    return {
      error: NextResponse.json(
        {
          error: 'Rate limit exceeded',
          limit: rateLimitResult.limit,
          usage: rateLimitResult.usage,
          reset_in: rateLimitResult.resetIn,
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': rateLimitResult.limit.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(Date.now() + (rateLimitResult.resetIn === '1 minute' ? 60 * 1000 : 60 * 60 * 1000)).toISOString(),
          },
        }
      ),
    };
  }

  updateApiKeyLastUsed(apiKeyRecord.id, getSupabaseAdmin());

  return {
    apiKeyRecord,
    startTime,
    rateLimitResult,
  };
}

/**
 * GET /api/v1/databases/[id]/tables/[tableId]/records/[recordId]
 * Get a specific record
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string; tableId: string; recordId: string } }
) {
  const auth = await authenticateApiKey(request, params.id);
  if (auth.error) return auth.error;

  try {
    const { data: record, error } = await getSupabaseAdmin()
      .from('records')
      .select('*')
      .eq('id', params.recordId)
      .eq('table_id', params.tableId)
      .single();

    if (error || !record) {
      return NextResponse.json(
        { error: 'Record not found' },
        { status: 404 }
      );
    }

    const responseTime = Date.now() - auth.startTime!;
    logApiUsage(
      auth.apiKeyRecord!.id,
      `/api/v1/databases/${params.id}/tables/${params.tableId}/records/${params.recordId}`,
      'GET',
      200,
      responseTime,
      getSupabaseAdmin()
    );

    return NextResponse.json({ record });
  } catch (error) {
    console.error('Public API GET record error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/v1/databases/[id]/tables/[tableId]/records/[recordId]
 * Update a record
 */
export async function PUT(
  request: Request,
  { params }: { params: { id: string; tableId: string; recordId: string } }
) {
  const auth = await authenticateApiKey(request, params.id);
  if (auth.error) return auth.error;

  try {
    const { data } = await request.json();

    if (!data || typeof data !== 'object') {
      return NextResponse.json(
        { error: 'Record data is required' },
        { status: 400 }
      );
    }

    const { data: updatedRecord, error } = await getSupabaseAdmin()
      .from('records')
      .update({ data_json: data })
      .eq('id', params.recordId)
      .eq('table_id', params.tableId)
      .select()
      .single();

    if (error) {
      console.error('Error updating record:', error);
      return NextResponse.json(
        { error: 'Failed to update record' },
        { status: 500 }
      );
    }

    const responseTime = Date.now() - auth.startTime!;
    logApiUsage(
      auth.apiKeyRecord!.id,
      `/api/v1/databases/${params.id}/tables/${params.tableId}/records/${params.recordId}`,
      'PUT',
      200,
      responseTime,
      getSupabaseAdmin()
    );

    return NextResponse.json({ record: updatedRecord });
  } catch (error) {
    console.error('Public API PUT error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/databases/[id]/tables/[tableId]/records/[recordId]
 * Delete a record
 */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string; tableId: string; recordId: string } }
) {
  const auth = await authenticateApiKey(request, params.id);
  if (auth.error) return auth.error;

  try {
    const { error } = await getSupabaseAdmin()
      .from('records')
      .delete()
      .eq('id', params.recordId)
      .eq('table_id', params.tableId);

    if (error) {
      console.error('Error deleting record:', error);
      return NextResponse.json(
        { error: 'Failed to delete record' },
        { status: 500 }
      );
    }

    const responseTime = Date.now() - auth.startTime!;
    logApiUsage(
      auth.apiKeyRecord!.id,
      `/api/v1/databases/${params.id}/tables/${params.tableId}/records/${params.recordId}`,
      'DELETE',
      200,
      responseTime,
      getSupabaseAdmin()
    );

    return NextResponse.json({ message: 'Record deleted successfully' });
  } catch (error) {
    console.error('Public API DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
