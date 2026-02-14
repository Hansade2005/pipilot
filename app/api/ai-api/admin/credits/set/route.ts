import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { setWalletBalance } from '@/lib/ai-api/wallet-manager';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const ADMIN_USER_IDS = process.env.ADMIN_USER_IDS?.split(',') || [];

async function verifyAdmin(token: string): Promise<{ isAdmin: boolean; userId?: string }> {
  try {
    const { data: { user }, error } = await getSupabase().auth.getUser(token);
    
    if (error || !user) {
      return { isAdmin: false };
    }

    const isAdmin = ADMIN_USER_IDS.includes(user.id);
    return { isAdmin, userId: user.id };
  } catch (error) {
    return { isAdmin: false };
  }
}

/**
 * POST /api/ai-api/admin/credits/set - Set wallet balance (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    // Verify admin
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Missing authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { isAdmin, userId: adminUserId } = await verifyAdmin(token);
    
    if (!isAdmin || !adminUserId) {
      return NextResponse.json(
        { error: 'Unauthorized: Admin access required' },
        { status: 403 }
      );
    }

    // Parse request
    const body = await request.json();
    const { userId, balance, description } = body;

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    if (typeof balance !== 'number' || balance < 0) {
      return NextResponse.json(
        { error: 'balance must be a non-negative number' },
        { status: 400 }
      );
    }

    // Set balance
    const success = await setWalletBalance(
      userId,
      balance,
      description || `Balance set by admin`,
      adminUserId
    );

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to set wallet balance' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Set wallet balance to $${balance.toFixed(2)} for user ${userId}`,
    });
  } catch (error) {
    console.error('Error setting wallet balance:', error);
    return NextResponse.json(
      { error: 'Failed to set wallet balance' },
      { status: 500 }
    );
  }
}
