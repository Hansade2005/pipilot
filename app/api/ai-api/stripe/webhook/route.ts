import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { addCredits } from '@/lib/ai-api/wallet-manager';
import { createClient } from '@supabase/supabase-js';

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2025-08-27.basil',
  });
}

function getWebhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET!;
}

/**
 * POST /api/ai-api/stripe/webhook - Handle Stripe webhook events
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: 400 }
      );
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = getStripe().webhooks.constructEvent(body, signature, getWebhookSecret());
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return NextResponse.json(
        { error: `Webhook Error: ${err.message}` },
        { status: 400 }
      );
    }

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        
        // Extract metadata
        const userId = session.metadata?.user_id;
        const amount = session.amount_total ? session.amount_total / 100 : 0; // Convert from cents
        
        if (userId && amount > 0) {
          // Add credits to wallet
          const success = await addCredits(
            userId,
            amount,
            'topup',
            `Stripe payment: ${session.id}`,
            {
              stripe_session_id: session.id,
              stripe_payment_intent: session.payment_intent,
              stripe_customer: session.customer,
            }
          );

          if (success) {
            console.log(`✅ Added $${amount} credits to user ${userId}`);
            
            // Create admin notification
            const supabase = createClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.SUPABASE_SERVICE_ROLE_KEY!
            );

            // Get user email
            const { data: userData } = await supabase.auth.admin.getUserById(userId);
            const userEmail = userData?.user?.email || 'Unknown';

            // Get all admin users
            const adminUserIds = process.env.ADMIN_USER_IDS?.split(',') || [];
            
            // Send notification to each admin
            for (const adminId of adminUserIds) {
              await supabase.from('user_notifications').insert({
                user_id: adminId,
                title: '💰 Payment Received',
                message: `${userEmail} added $${amount.toFixed(2)} to their wallet`,
                body: `Payment Details:\n\nUser: ${userEmail}\nAmount: $${amount.toFixed(2)}\nSession: ${session.id}\nPayment Method: ${session.payment_method_types?.join(', ') || 'card'}\n\nThe credits have been automatically added to the user's wallet.`,
                type: 'success',
                url: '/admin/billing',
                priority: 2,
                is_read: false,
              });
            }
          } else {
            console.error(`❌ Failed to add credits for session ${session.id}`);
          }
        }
        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log(`✅ Payment succeeded: ${paymentIntent.id}`);
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log(`❌ Payment failed: ${paymentIntent.id}`);
        break;
      }

      case 'customer.created': {
        const customer = event.data.object as Stripe.Customer;
        console.log(`✅ Customer created: ${customer.id}`);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
