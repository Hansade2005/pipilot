import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { addCredits, setWalletBalance } from '@/lib/ai-api/wallet-manager';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Admin user IDs (replace with your actual admin user IDs)
const ADMIN_USER_IDS = process.env.ADMIN_USER_IDS?.split(',') || [];

async function verifyAdmin(token: string): Promise<{ isAdmin: boolean; userId?: string }> {
  try {
    const { data: { user }, error } = await getSupabase().auth.getUser(token);
    
    if (error || !user) {
      return { isAdmin: false };
    }

    // Check if user is admin
    const isAdmin = ADMIN_USER_IDS.includes(user.id);
    
    return { isAdmin, userId: user.id };
  } catch (error) {
    console.error('Error verifying admin:', error);
    return { isAdmin: false };
  }
}

/**
 * POST /api/ai-api/admin/credits/bonus - Send bonus credits to user
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
    const { userId, amount, description } = body;

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { error: 'amount must be a positive number' },
        { status: 400 }
      );
    }

    // Add bonus credits
    const success = await addCredits(
      userId,
      amount,
      'bonus',
      description || `Bonus credits from admin`,
      { admin_user_id: adminUserId }
    );

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to add bonus credits' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Added $${amount.toFixed(2)} bonus credits to user ${userId}`,
    });
  } catch (error) {
    console.error('Error adding bonus credits:', error);
    return NextResponse.json(
      { error: 'Failed to add bonus credits' },
      { status: 500 }
    );
  }
}
