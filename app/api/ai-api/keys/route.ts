import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createApiKey, listApiKeys, deactivateApiKey } from '@/lib/ai-api/api-key-manager';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET /api/ai-api/keys - List all API keys for authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    // Get user from session
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Missing authorization header' },
        { status: 401 }
      );
    }

    // Extract token
    const token = authHeader.replace('Bearer ', '');
    
    // Verify user
    const { data: { user }, error: authError } = await getSupabase().auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      );
    }

    // Get API keys
    const keys = await listApiKeys(user.id);

    return NextResponse.json({
      success: true,
      keys,
    });
  } catch (error) {
    console.error('Error listing API keys:', error);
    return NextResponse.json(
      { error: 'Failed to list API keys' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ai-api/keys - Create new API key
 */
export async function POST(request: NextRequest) {
  try {
    // Get user from session
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Missing authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await getSupabase().auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { name, rateLimitPerMinute, rateLimitPerDay, expiresAt } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'Name is required and must be a string' },
        { status: 400 }
      );
    }

    // Create API key
    const result = await createApiKey(user.id, name, {
      rateLimitPerMinute,
      rateLimitPerDay,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });

    if (!result) {
      return NextResponse.json(
        { error: 'Failed to create API key' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      apiKey: result.apiKey, // Full key shown ONCE
      keyPrefix: result.keyPrefix,
      id: result.id,
      warning: 'Save this API key securely. You will not be able to see it again.',
    });
  } catch (error) {
    console.error('Error creating API key:', error);
    return NextResponse.json(
      { error: 'Failed to create API key' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/ai-api/keys - Deactivate API key
 */
export async function DELETE(request: NextRequest) {
  try {
    // Get user from session
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Missing authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await getSupabase().auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { keyId } = body;

    if (!keyId) {
      return NextResponse.json(
        { error: 'keyId is required' },
        { status: 400 }
      );
    }

    // Deactivate key
    const success = await deactivateApiKey(keyId, user.id);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to deactivate API key' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'API key deactivated successfully',
    });
  } catch (error) {
    console.error('Error deactivating API key:', error);
    return NextResponse.json(
      { error: 'Failed to deactivate API key' },
      { status: 500 }
    );
  }
}
