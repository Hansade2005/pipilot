import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2025-08-27.basil',
  });
}

/**
 * POST /api/ai-api/stripe/checkout - Create Stripe checkout session for wallet top-up
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

    // Parse request
    const body = await request.json();
    const { amount } = body;

    if (!amount || typeof amount !== 'number' || amount < 1) {
      return NextResponse.json(
        { error: 'Amount must be at least $1' },
        { status: 400 }
      );
    }

    if (amount > 1000) {
      return NextResponse.json(
        { error: 'Maximum top-up amount is $1000' },
        { status: 400 }
      );
    }

    // Get or create Stripe customer
    const { data: wallet } = await getSupabase()
      .from('ai_wallets')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single();

    let customerId = wallet?.stripe_customer_id;

    if (!customerId) {
      // Create new Stripe customer
      const customer = await getStripe().customers.create({
        email: user.email,
        metadata: {
          user_id: user.id,
        },
      });

      customerId = customer.id;

      // Update wallet with customer ID
      await getSupabase()
        .from('ai_wallets')
        .update({ stripe_customer_id: customerId })
        .eq('user_id', user.id);
    }

    // Create checkout session
    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'AI API Credits',
              description: `Add $${amount.toFixed(2)} to your wallet`,
            },
            unit_amount: Math.round(amount * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/ai/platform/wallet?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/ai/platform/wallet?canceled=true`,
      metadata: {
        user_id: user.id,
        amount: amount.toString(),
      },
    });

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
