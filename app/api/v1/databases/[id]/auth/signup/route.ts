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
import {
  generateToken,
  generateRefreshToken,
  hashPassword,
  validateEmail,
  validatePasswordStrength,
} from '@/lib/auth-jwt';

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
        { status: 429 }
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
 * POST /api/v1/databases/[id]/auth/signup
 * Register a new user in the database
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiKey(request, params.id);
  if (auth.error) return auth.error;

  try {
    const { email, password, full_name, avatar_url } = await request.json();

    // Validate required fields
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Validate email format
    if (!validateEmail(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        {
          error: 'Password does not meet requirements',
          details: passwordValidation.errors,
        },
        { status: 400 }
      );
    }

    // Check if users table exists
    const { data: tables, error: tableError } = await getSupabaseAdmin()
      .from('tables')
      .select('*')
      .eq('database_id', params.id)
      .eq('name', 'users')
      .single();

    if (tableError || !tables) {
      return NextResponse.json(
        { error: 'Users table not found in this database' },
        { status: 404 }
      );
    }

    // Check if user already exists
    const { data: existingUsers, error: checkError } = await getSupabaseAdmin()
      .from('records')
      .select('*')
      .eq('table_id', tables.id)
      .ilike('data_json->>email', email);

    if (checkError) {
      console.error('Error checking existing user:', checkError);
      return NextResponse.json(
        { error: 'Failed to check existing user' },
        { status: 500 }
      );
    }

    if (existingUsers && existingUsers.length > 0) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = hashPassword(password);

    // Create user record
    const userData = {
      email,
      password_hash: passwordHash,
      full_name: full_name || null,
      avatar_url: avatar_url || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: newUser, error: insertError } = await getSupabaseAdmin()
      .from('records')
      .insert({
        table_id: tables.id,
        data_json: userData,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating user:', insertError);
      return NextResponse.json(
        { error: 'Failed to create user' },
        { status: 500 }
      );
    }

    // Generate JWT tokens
    const accessToken = generateToken(newUser.id, email, params.id);
    const refreshToken = generateRefreshToken(newUser.id, email, params.id);

    // Remove password_hash from response
    const { password_hash, ...userDataWithoutPassword } = userData;

    // Log API usage
    const responseTime = Date.now() - auth.startTime!;
    logApiUsage(
      auth.apiKeyRecord!.id,
      `/api/v1/databases/${params.id}/auth/signup`,
      'POST',
      201,
      responseTime,
      getSupabaseAdmin()
    );

    return NextResponse.json(
      {
        message: 'User registered successfully',
        user: {
          id: newUser.id,
          ...userDataWithoutPassword,
        },
        tokens: {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: 86400, // 24 hours
          token_type: 'Bearer',
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
