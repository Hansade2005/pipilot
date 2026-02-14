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
import { validateTableSchema } from '@/lib/validate-schema';

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
 * GET /api/v1/databases/[id]/tables
 * List all tables in the database
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const databaseId = params.id;

    // Authenticate API key
    const authResult = await authenticateApiKey(request, databaseId);
    if ('error' in authResult) {
      return authResult.error;
    }

    const { apiKeyRecord, startTime } = authResult;

    // Get all tables in this database
    const { data: tables, error: tablesError } = await getSupabaseAdmin()
      .from('tables')
      .select('*')
      .eq('database_id', databaseId)
      .order('created_at', { ascending: true });

    if (tablesError) {
      console.error('Error fetching tables:', tablesError);
      return NextResponse.json(
        { error: 'Failed to fetch tables' },
        { status: 500 }
      );
    }

    // Get record counts for each table
    const tablesWithCounts = await Promise.all(
      (tables || []).map(async (table) => {
        const { count } = await getSupabaseAdmin()
          .from('records')
          .select('*', { count: 'exact', head: true })
          .eq('table_id', table.id);

        return {
          id: table.id,
          name: table.name,
          created_at: table.created_at,
          updated_at: table.updated_at,
          record_count: count || 0,
          schema_json: table.schema_json
        };
      })
    );

    // Log API usage
    await logApiUsage(
      apiKeyRecord.id,
      `/api/v1/databases/${databaseId}/tables`,
      'GET',
      200,
      Date.now() - startTime,
      getSupabaseAdmin()
    );

    return NextResponse.json({
      success: true,
      tables: tablesWithCounts,
      total: tablesWithCounts.length
    });

  } catch (error: any) {
    console.error('Unexpected error in list tables:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/databases/[id]/tables
 * Create a new table in the database
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const databaseId = params.id;
    const body = await request.json();
    const { name, schema } = body;

    if (!name || !schema) {
      return NextResponse.json(
        { error: 'Table name and schema are required' },
        { status: 400 }
      );
    }

    // Validate schema
    const schemaValidation = validateTableSchema(schema);
    if (!schemaValidation.valid) {
      return NextResponse.json({ error: schemaValidation.errors }, { status: 400 });
    }

    // Authenticate API key
    const authResult = await authenticateApiKey(request, databaseId);
    if ('error' in authResult) {
      return authResult.error;
    }

    const { apiKeyRecord, startTime } = authResult;

    // Check if table name already exists in this database
    const { data: existingTable } = await getSupabaseAdmin()
      .from('tables')
      .select('id')
      .eq('database_id', databaseId)
      .eq('name', name)
      .single();

    if (existingTable) {
      return NextResponse.json(
        { error: 'Table with this name already exists' },
        { status: 409 }
      );
    }

    // Create the table
    const { data: newTable, error: createError } = await getSupabaseAdmin()
      .from('tables')
      .insert({
        database_id: databaseId,
        name,
        schema_json: schema
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating table:', createError);
      return NextResponse.json(
        { error: 'Failed to create table' },
        { status: 500 }
      );
    }

    // Log API usage
    await logApiUsage(
      apiKeyRecord.id,
      `/api/v1/databases/${databaseId}/tables`,
      'POST',
      201,
      Date.now() - startTime,
      getSupabaseAdmin()
    );

    return NextResponse.json({
      success: true,
      table: {
        id: newTable.id,
        name: newTable.name,
        database_id: newTable.database_id,
        created_at: newTable.created_at,
        updated_at: newTable.updated_at,
        schema_json: newTable.schema_json
      }
    }, { status: 201 });

  } catch (error: any) {
    console.error('Unexpected error in create table:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}