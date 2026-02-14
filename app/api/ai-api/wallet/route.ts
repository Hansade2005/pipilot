import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getOrCreateWallet, getWalletBalance, getTransactions } from '@/lib/ai-api/wallet-manager';
import { getUsageStats } from '@/lib/ai-api/billing-manager';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET /api/ai-api/wallet - Get wallet info and balance
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

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await getSupabase().auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      );
    }

    // Get wallet
    const wallet = await getOrCreateWallet(user.id);
    if (!wallet) {
      return NextResponse.json(
        { error: 'Failed to get wallet' },
        { status: 500 }
      );
    }

    // Get recent transactions
    const transactions = await getTransactions(user.id, { limit: 10 });

    // Get usage stats
    const usageStats = await getUsageStats(user.id);

    return NextResponse.json({
      success: true,
      wallet: {
        id: wallet.id,
        balance: parseFloat(wallet.balance),
        currency: wallet.currency,
        stripeCustomerId: wallet.stripe_customer_id,
      },
      transactions,
      usageStats,
    });
  } catch (error) {
    console.error('Error getting wallet:', error);
    return NextResponse.json(
      { error: 'Failed to get wallet' },
      { status: 500 }
    );
  }
}
