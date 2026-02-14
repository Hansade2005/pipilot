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

  // Hash the provided key
  const keyHash = hashApiKey(apiKey);

  // Look up the API key in database
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

  // Check rate limit
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

  // Update last_used_at timestamp
  updateApiKeyLastUsed(apiKeyRecord.id, getSupabaseAdmin());

  return {
    apiKeyRecord,
    startTime,
    rateLimitResult,
  };
}

/**
 * GET /api/v1/databases/[id]/tables/[tableId]/records
 * Get all records from a table
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string; tableId: string } }
) {
  const auth = await authenticateApiKey(request, params.id);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');
    const search = searchParams.get('search') || '';

    // Get table info
    const { data: table, error: tableError } = await getSupabaseAdmin()
      .from('tables')
      .select('*')
      .eq('id', params.tableId)
      .eq('database_id', params.id)
      .single();

    if (tableError || !table) {
      return NextResponse.json(
        { error: 'Table not found' },
        { status: 404 }
      );
    }

    // Build query
    let query = getSupabaseAdmin()
      .from('records')
      .select('*', { count: 'exact' })
      .eq('table_id', params.tableId)
      .range(offset, offset + limit - 1);

    // Add search if provided
    if (search) {
      query = query.ilike('data_json', `%${search}%`);
    }

    const { data: records, error: recordsError, count } = await query;

    if (recordsError) {
      console.error('Error fetching records:', recordsError);
      return NextResponse.json(
        { error: 'Failed to fetch records' },
        { status: 500 }
      );
    }

    // Log API usage
    const responseTime = Date.now() - auth.startTime!;
    logApiUsage(
      auth.apiKeyRecord!.id,
      `/api/v1/databases/${params.id}/tables/${params.tableId}/records`,
      'GET',
      200,
      responseTime,
      getSupabaseAdmin()
    );

    return NextResponse.json({
      records: records || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
        has_more: count ? offset + limit < count : false,
      },
    }, {
      headers: {
        'X-RateLimit-Limit': auth.rateLimitResult!.limit.toString(),
        'X-RateLimit-Remaining': (auth.rateLimitResult!.limit - auth.rateLimitResult!.usage - 1).toString(),
      },
    });
  } catch (error) {
    console.error('Public API GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/databases/[id]/tables/[tableId]/records
 * Create a new record
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string; tableId: string } }
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

    // Get table info
    const { data: table, error: tableError } = await getSupabaseAdmin()
      .from('tables')
      .select('*')
      .eq('id', params.tableId)
      .eq('database_id', params.id)
      .single();

    if (tableError || !table) {
      return NextResponse.json(
        { error: 'Table not found' },
        { status: 404 }
      );
    }

    // Create record
    const { data: newRecord, error: insertError } = await getSupabaseAdmin()
      .from('records')
      .insert({
        table_id: params.tableId,
        data_json: data,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating record:', insertError);
      return NextResponse.json(
        { error: 'Failed to create record' },
        { status: 500 }
      );
    }

    // Log API usage
    const responseTime = Date.now() - auth.startTime!;
    logApiUsage(
      auth.apiKeyRecord!.id,
      `/api/v1/databases/${params.id}/tables/${params.tableId}/records`,
      'POST',
      201,
      responseTime,
      getSupabaseAdmin()
    );

    return NextResponse.json(
      { record: newRecord },
      {
        status: 201,
        headers: {
          'X-RateLimit-Limit': auth.rateLimitResult!.limit.toString(),
          'X-RateLimit-Remaining': (auth.rateLimitResult!.limit - auth.rateLimitResult!.usage - 1).toString(),
        },
      }
    );
  } catch (error) {
    console.error('Public API POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
