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
 * GET /api/v1/databases/[id]/tables/[tableId]
 * Get detailed information about a specific table
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; tableId: string } }
) {
  try {
    const { id: databaseId, tableId } = params;

    // Authenticate API key
    const authResult = await authenticateApiKey(request, databaseId);
    if ('error' in authResult) {
      return authResult.error;
    }

    const { apiKeyRecord, startTime } = authResult;

    // Get table
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

    // Get record count
    const { count: recordCount } = await getSupabaseAdmin()
      .from('records')
      .select('*', { count: 'exact', head: true })
      .eq('table_id', tableId);

    // Format table information
    const schema = table.schema_json || {};
    const tableInfo = {
      id: table.id,
      name: table.name,
      database_id: table.database_id,
      created_at: table.created_at,
      updated_at: table.updated_at,
      record_count: recordCount || 0,
      schema: {
        column_count: schema.columns?.length || 0,
        columns: schema.columns?.map((col: any) => ({
          name: col.name,
          type: col.type,
          required: col.required || false,
          unique: col.unique || false,
          default_value: col.defaultValue,
          description: col.description,
          references: col.references
        })) || [],
        indexes: schema.indexes || [],
        constraints: schema.constraints || []
      }
    };

    // Log API usage
    await logApiUsage(
      apiKeyRecord.id,
      `/api/v1/databases/${databaseId}/tables/${tableId}`,
      'GET',
      200,
      Date.now() - startTime,
      getSupabaseAdmin()
    );

    return NextResponse.json({
      success: true,
      table: tableInfo
    });

  } catch (error: any) {
    console.error('Unexpected error in read table:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/databases/[id]/tables/[tableId]
 * Delete a table and all its records
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; tableId: string } }
) {
  try {
    const { id: databaseId, tableId } = params;

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

    // Get record count for response
    const { count: recordCount } = await getSupabaseAdmin()
      .from('records')
      .select('*', { count: 'exact', head: true })
      .eq('table_id', tableId);

    // Delete table (records will cascade delete due to FK constraint)
    const { error: deleteError } = await getSupabaseAdmin()
      .from('tables')
      .delete()
      .eq('id', tableId);

    if (deleteError) {
      console.error('Error deleting table:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete table' },
        { status: 500 }
      );
    }

    // Log API usage
    await logApiUsage(
      apiKeyRecord.id,
      `/api/v1/databases/${databaseId}/tables/${tableId}`,
      'DELETE',
      200,
      Date.now() - startTime,
      getSupabaseAdmin()
    );

    return NextResponse.json({
      success: true,
      message: 'Table deleted successfully',
      table_name: table.name,
      deleted_records: recordCount || 0
    });

  } catch (error: any) {
    console.error('Unexpected error in delete table:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}