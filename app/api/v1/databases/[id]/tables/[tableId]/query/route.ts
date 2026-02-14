import { NextRequest, NextResponse } from 'next/server';
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

interface QueryCondition {
  field: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'ILIKE' | 'IN' | 'NOT IN' | 'IS NULL' | 'IS NOT NULL' | 'CONTAINS';
  value?: any;
  logic?: 'AND' | 'OR';
}

interface HavingCondition {
  field: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'ILIKE';
  value: any;
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
 * GET /api/v1/databases/[id]/tables/[tableId]/query
 * Advanced database querying with MySQL-like capabilities
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; tableId: string } }
) {
  try {
    const { id: databaseId, tableId } = params;
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '100'), 1), 1000);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);
    const search = searchParams.get('search');
    const orderBy = searchParams.get('orderBy');
    const orderDirection = (searchParams.get('orderDirection')?.toUpperCase() as 'ASC' | 'DESC') || 'ASC';
    const select = searchParams.get('select')?.split(',').map(s => s.trim()).filter(Boolean);
    const conditions: QueryCondition[] = searchParams.get('conditions') ? JSON.parse(searchParams.get('conditions')!) : [];
    const groupBy = searchParams.get('groupBy')?.split(',').map(s => s.trim()).filter(Boolean);
    const having: HavingCondition | null = searchParams.get('having') ? JSON.parse(searchParams.get('having')!) : null;
    const includeCount = searchParams.get('includeCount') !== 'false';

    // Authenticate API key
    const authResult = await authenticateApiKey(request, databaseId);
    if ('error' in authResult) {
      return authResult.error;
    }

    const { apiKeyRecord, startTime } = authResult;

    // Verify table exists
    const { data: table, error: tableError } = await getSupabaseAdmin()
      .from('tables')
      .select('*')
      .eq('id', tableId)
      .eq('database_id', databaseId)
      .single();

    if (tableError || !table) {
      return NextResponse.json(
        { error: 'Table not found' },
        { status: 404 }
      );
    }

    // Build query for records
    let query = getSupabaseAdmin()
      .from('records')
      .select(select ? select.join(',') : '*', { count: includeCount ? 'exact' : undefined })
      .eq('table_id', tableId);

    // Apply WHERE conditions
    for (const condition of conditions) {
      const { field, operator, value, logic } = condition;

      switch (operator) {
        case '=':
          query = query.eq(field, value);
          break;
        case '!=':
          query = query.neq(field, value);
          break;
        case '>':
          query = query.gt(field, value);
          break;
        case '<':
          query = query.lt(field, value);
          break;
        case '>=':
          query = query.gte(field, value);
          break;
        case '<=':
          query = query.lte(field, value);
          break;
        case 'LIKE':
          query = query.like(field, value);
          break;
        case 'ILIKE':
          query = query.ilike(field, value);
          break;
        case 'IN':
          query = query.in(field, value);
          break;
        case 'NOT IN':
          query = query.not(field, 'in', value);
          break;
        case 'IS NULL':
          query = query.is(field, null);
          break;
        case 'IS NOT NULL':
          query = query.not(field, 'is', null);
          break;
        case 'CONTAINS':
          query = query.contains(field, value);
          break;
      }
    }

    // Apply search if provided
    if (search) {
      // Simple text search across all string fields
      const schema = table.schema_json || {};
      const textFields = schema.columns?.filter((col: any) =>
        ['text', 'varchar', 'string'].includes(col.type?.toLowerCase())
      ).map((col: any) => col.name) || [];

      if (textFields.length > 0) {
        const searchConditions = textFields.map((field: string) => `${field}.ilike.%${search}%`);
        query = query.or(searchConditions.join(','));
      }
    }

    // Apply ordering
    if (orderBy) {
      query = query.order(orderBy, { ascending: orderDirection === 'ASC' });
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    // Execute query
    const { data: records, error: queryError, count } = await query;

    if (queryError) {
      console.error('Error executing query:', queryError);
      return NextResponse.json(
        { error: 'Failed to execute query' },
        { status: 500 }
      );
    }

    // Log API usage
    await logApiUsage(
      apiKeyRecord.id,
      `/api/v1/databases/${databaseId}/tables/${tableId}/query`,
      'GET',
      200,
      Date.now() - startTime,
      getSupabaseAdmin()
    );

    return NextResponse.json({
      success: true,
      data: records || [],
      total: count || 0,
      limit,
      offset,
      has_more: (count || 0) > (offset + limit)
    });

  } catch (error: any) {
    console.error('Unexpected error in query database:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}