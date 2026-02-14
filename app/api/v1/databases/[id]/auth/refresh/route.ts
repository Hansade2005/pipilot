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
import { verifyToken, generateToken } from '@/lib/auth-jwt';

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
 * POST /api/v1/databases/[id]/auth/refresh
 * Refresh an access token using a refresh token
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiKey(request, params.id);
  if (auth.error) return auth.error;

  try {
    const { refresh_token } = await request.json();

    if (!refresh_token) {
      return NextResponse.json(
        { error: 'Refresh token is required' },
        { status: 400 }
      );
    }

    // Verify refresh token
    const payload = verifyToken(refresh_token);

    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid or expired refresh token' },
        { status: 401 }
      );
    }

    // Verify database ID matches
    if (payload.databaseId !== params.id) {
      return NextResponse.json(
        { error: 'Refresh token is not valid for this database' },
        { status: 401 }
      );
    }

    // Verify it's a refresh token (should have longer expiry)
    const now = Math.floor(Date.now() / 1000);
    const tokenAge = now - payload.iat!;
    
    // Refresh tokens should have been issued with 7 day expiry
    // If token expires in less than 6 days, it's likely an access token
    const timeUntilExpiry = payload.exp! - now;
    if (timeUntilExpiry < 6 * 24 * 60 * 60) {
      return NextResponse.json(
        { error: 'Invalid refresh token (appears to be an access token)' },
        { status: 401 }
      );
    }

    // Verify user still exists and is active
    const { data: user, error: userError } = await getSupabaseAdmin()
      .from('records')
      .select('*')
      .eq('id', payload.userId)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'User not found or inactive' },
        { status: 404 }
      );
    }

    const userData = user.data_json as any;

    // Generate new access token (refresh token stays valid)
    const newAccessToken = generateToken(
      payload.userId,
      payload.email,
      params.id
    );

    // Remove password_hash from response
    const { password_hash, ...userDataWithoutPassword } = userData;

    // Log API usage
    const responseTime = Date.now() - auth.startTime!;
    logApiUsage(
      auth.apiKeyRecord!.id,
      `/api/v1/databases/${params.id}/auth/refresh`,
      'POST',
      200,
      responseTime,
      getSupabaseAdmin()
    );

    return NextResponse.json({
      message: 'Token refreshed successfully',
      user: {
        id: user.id,
        ...userDataWithoutPassword,
      },
      tokens: {
        access_token: newAccessToken,
        // Return the same refresh token - still valid
        refresh_token: refresh_token,
        expires_in: 86400, // 24 hours in seconds
        token_type: 'Bearer',
      },
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
