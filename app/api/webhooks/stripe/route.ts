import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Stripe from 'stripe'
import * as crypto from 'crypto'
import { headers } from 'next/headers'
import { PRODUCT_CONFIGS, EXTRA_CREDITS_PRODUCT } from '@/lib/stripe-config'
import { addCredits } from '@/lib/billing/credit-manager'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-08-27.basil'
})

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const headersList = await headers()
    const signature = headersList.get('stripe-signature')

    if (!signature) {
      console.error('No Stripe signature found')
      return NextResponse.json(
        { error: 'No signature' },
        { status: 400 }
      )
    }

    let event: Stripe.Event

    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        webhookSecret
      )
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message)
      return NextResponse.json(
        { error: `Webhook Error: ${err.message}` },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Handle the event
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const userId = subscription.metadata.user_id

        if (!userId) {
          console.error('No user_id in subscription metadata')
          break
        }

        // Check if this is a Search API subscription
        if (subscription.metadata.product === 'search-api') {
          await handleSearchApiSubscriptionUpdate(subscription)
          break
        }

        // Get plan from price ID
        const priceId = subscription.items.data[0]?.price.id
        const planId = getPlanFromPriceId(priceId) || 'free'
        const status = subscription.status

        // Get current wallet to calculate credit grant
        const { data: currentWallet } = await supabase
          .from('wallet')
          .select('credits_balance, current_plan')
          .eq('user_id', userId)
          .single()

        const creditsBefore = currentWallet?.credits_balance || 0
        const planConfig = PRODUCT_CONFIGS[planId]
        const monthlyCredits = planConfig?.limits.credits || 20

        // Update wallet with subscription info
        const { error } = await supabase
          .from('wallet')
          .upsert({
            user_id: userId,
            stripe_customer_id: subscription.customer as string,
            stripe_subscription_id: subscription.id,
            current_plan: planId,
            subscription_status: mapStripeStatus(status),
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_id'
          })

        if (error) {
          console.error('Error updating subscription:', error)
        } else {
          // Grant monthly credits using credit-manager
          await addCredits(
            userId,
            monthlyCredits,
            'subscription_grant',
            `Monthly credit grant for ${planId} plan`,
            supabase,
            subscription.id
          )

          console.log(`Subscription ${subscription.id} ${event.type} for user ${userId}, granted ${monthlyCredits} credits`)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const userId = subscription.metadata.user_id

        if (!userId) {
          console.error('No user_id in subscription metadata')
          break
        }

        // Check if this is a Search API subscription
        if (subscription.metadata.product === 'search-api') {
          await handleSearchApiSubscriptionDeleted(subscription)
          break
        }

        // Update wallet to inactive status, keep current credits
        const { error } = await supabase
          .from('wallet')
          .update({
            subscription_status: 'inactive',
            stripe_subscription_id: null,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId)

        if (error) {
          console.error('Error deleting subscription:', error)
        } else {
          console.log(`Subscription deleted for user ${userId}`)
        }
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = (invoice as any).subscription as string

        if (subscriptionId) {
          // This is a subscription renewal
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)
          const userId = subscription.metadata.user_id

          // Search API renewal - just update period end in KV
          if (subscription.metadata.product === 'search-api' && userId) {
            await handleSearchApiSubscriptionUpdate(subscription)
            console.log(`Search API: Invoice payment succeeded for user ${userId}`)
            break
          }

          if (userId) {
            const planId = getPlanFromPriceId(subscription.items.data[0]?.price.id) || 'free'
            const planConfig = PRODUCT_CONFIGS[planId]
            const monthlyCredits = planConfig?.limits.credits || 20

            // Get current balance
            const { data: wallet } = await supabase
              .from('wallet')
              .select('credits_balance')
              .eq('user_id', userId)
              .single()

            const creditsBefore = wallet?.credits_balance || 0

            // Update subscription status
            await supabase
              .from('wallet')
              .update({
                subscription_status: 'active',
                updated_at: new Date().toISOString()
              })
              .eq('user_id', userId)

            // Grant monthly credits using credit-manager
            await addCredits(
              userId,
              monthlyCredits,
              'subscription_grant',
              `Monthly renewal credit grant for ${planId} plan`,
              supabase,
              subscriptionId
            )

            console.log(`Monthly credits granted for user ${userId}: +${monthlyCredits}`)
          }
        } else {
          // This might be a one-time payment (credit purchase)
          await handleOneTimePayment(invoice, supabase)
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = (invoice as any).subscription as string

        if (!subscriptionId) break

        // Get subscription to find user_id
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        const userId = subscription.metadata.user_id

        if (!userId) {
          console.error('No user_id in subscription metadata')
          break
        }

        // Search API payment failure - update KV status
        if (subscription.metadata.product === 'search-api') {
          const existing = await kvGet(`user:${userId}:subscription`)
          if (existing) {
            existing.status = 'past_due'
            existing.updatedAt = new Date().toISOString()
            await kvPut(`user:${userId}:subscription`, existing)
            console.log(`Search API: Payment failed for user ${userId}`)
          }
          break
        }

        // Update subscription status to past_due
        const { error } = await supabase
          .from('wallet')
          .update({
            subscription_status: 'past_due',
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId)

        if (error) {
          console.error('Error updating failed payment:', error)
        } else {
          console.log(`Payment failed for user ${userId}`)
        }
        break
      }

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session

        // Handle Search API subscription checkout
        if (session.mode === 'subscription' && session.metadata?.product === 'search-api') {
          await handleSearchApiCheckoutCompleted(session)
          break
        }

        // Handle one-time credit purchases or marketplace purchases
        if (session.mode === 'payment' && session.metadata?.user_id) {
          await handleCreditPurchase(session, supabase)
        } else if (session.mode === 'payment' && session.metadata?.purchase_type) {
          // Handle marketplace template/bundle purchases
          await handleMarketplacePurchase(session, supabase)
        }
        break
      }

      case 'charge.succeeded': {
        // Handle marketplace purchases via Stripe Payments (legacy)
        const charge = event.data.object as Stripe.Charge

        if (charge.metadata?.purchase_type === 'template' || charge.metadata?.purchase_type === 'bundle') {
          await handleMarketplaceCharge(charge, supabase, 'sale')
        }
        break
      }

      case 'charge.refunded': {
        // Handle marketplace purchase refunds
        const charge = event.data.object as Stripe.Charge

        if (charge.metadata?.purchase_type === 'template' || charge.metadata?.purchase_type === 'bundle') {
          await handleMarketplaceCharge(charge, supabase, 'refund')
        }
        break
      }

      case 'customer.subscription.trial_will_end': {
        const subscription = event.data.object as Stripe.Subscription
        const userId = subscription.metadata.user_id

        if (!userId) break

        console.log(`Trial ending soon for user ${userId}`)
        // You could send an email notification here
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('Webhook handler error:', error)
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    )
  }
}

// Helper function to handle one-time credit purchases
async function handleOneTimePayment(invoice: any, supabase: any) {
  const userId = invoice.customer_metadata?.user_id || invoice.metadata?.user_id
  if (!userId) return

  // Calculate credits purchased: 1 credit = $0.01 = 1 cent
  const amountPaidCents = invoice.amount_paid // amount in cents
  const creditsPurchased = Math.floor(amountPaidCents / EXTRA_CREDITS_PRODUCT.pricePerCreditCents)

  if (creditsPurchased <= 0) return

  // Add credits using credit-manager
  await addCredits(
    userId,
    creditsPurchased,
    'purchase',
    `Purchased ${creditsPurchased} extra credits`,
    supabase,
    invoice.payment_intent as string
  )

  console.log(`Credits purchased for user ${userId}: +${creditsPurchased}`)
}

// Helper function to handle credit purchases from checkout sessions
async function handleCreditPurchase(session: Stripe.Checkout.Session, supabase: any) {
  const userId = session.metadata?.user_id
  if (!userId) return

  // Credits count is stored in session metadata by purchase-credits route
  const creditsFromMetadata = parseInt(session.metadata?.credits || '0', 10)

  if (creditsFromMetadata > 0) {
    // Use metadata credits (most reliable - set by our purchase-credits route)
    await addCredits(
      userId,
      creditsFromMetadata,
      'purchase',
      `Purchased ${creditsFromMetadata} extra credits via checkout`,
      supabase,
      session.payment_intent as string
    )

    console.log(`Credits purchased via checkout for user ${userId}: +${creditsFromMetadata}`)
  } else {
    // Fallback: calculate from amount paid (1 credit = 1 cent)
    const amountPaidCents = session.amount_total || 0
    const creditsPurchased = Math.floor(amountPaidCents / EXTRA_CREDITS_PRODUCT.pricePerCreditCents)

    if (creditsPurchased <= 0) return

    await addCredits(
      userId,
      creditsPurchased,
      'purchase',
      `Purchased ${creditsPurchased} extra credits via checkout`,
      supabase,
      session.payment_intent as string
    )

    console.log(`Credits purchased via checkout for user ${userId}: +${creditsPurchased}`)
  }
}

// Helper function to map Stripe price ID to plan ID
function getPlanFromPriceId(priceId: string | undefined): string | null {
  if (!priceId) return null

  for (const [planId, config] of Object.entries(PRODUCT_CONFIGS)) {
    if (config.prices.monthly.stripePriceId === priceId || config.prices.yearly.stripePriceId === priceId) {
      return planId
    }
  }
  return null
}

// Helper function to map Stripe status to our database enum
function mapStripeStatus(stripeStatus: string): string {
  const statusMap: Record<string, string> = {
    'active': 'active',
    'trialing': 'active', // Treat trialing as active for credits
    'past_due': 'past_due',
    'canceled': 'cancelled',
    'unpaid': 'inactive',
    'incomplete': 'inactive',
    'incomplete_expired': 'inactive'
  }

  return statusMap[stripeStatus] || 'inactive'
}

// Helper function to handle marketplace checkout sessions
async function handleMarketplacePurchase(session: Stripe.Checkout.Session, supabase: any) {
  const buyerId = session.metadata?.buyer_id
  const creatorId = session.metadata?.creator_id
  const templateIds = session.metadata?.template_ids?.split(',') || []
  const bundleId = session.metadata?.bundle_id
  const platformFee = parseFloat(session.metadata?.platform_fee || '0')
  const creatorEarnings = parseFloat(session.metadata?.creator_earnings || '0')

  if (!buyerId || !creatorId) return

  // Update purchase status to completed
  const { error: updateError } = await supabase
    .from('template_purchases')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('payment_intent_id', session.payment_intent as string)

  if (updateError) {
    console.error('Failed to update marketplace purchase:', updateError)
    return
  }

  // Update creator marketplace wallet
  const { data: wallet, error: walletError } = await supabase
    .from('marketplace_wallet')
    .select('*')
    .eq('creator_id', creatorId)
    .single()

  if (walletError || !wallet) {
    console.error('Failed to fetch creator marketplace wallet:', walletError)
    return
  }

  // Update wallet balance
  const newAvailableBalance = (wallet.available_balance || 0) + creatorEarnings
  const newTotalEarned = (wallet.total_earned || 0) + creatorEarnings

  await supabase
    .from('marketplace_wallet')
    .update({
      available_balance: newAvailableBalance,
      total_earned: newTotalEarned,
      updated_at: new Date().toISOString(),
    })
    .eq('id', wallet.id)

  // Record transaction
  await supabase
    .from('marketplace_transactions')
    .insert({
      wallet_id: wallet.id,
      transaction_type: 'sale',
      amount: creatorEarnings,
      reference_id: session.payment_intent,
      description: bundleId ? 'Bundle sale' : 'Template sale',
      created_at: new Date().toISOString(),
    })

  // Update creator profile earnings
  await supabase
    .from('profiles')
    .update({
      total_earnings: newTotalEarned,
    })
    .eq('id', creatorId)

  // Update template metadata stats
  if (templateIds.length > 0) {
    for (const templateId of templateIds) {
      const { data: metadata } = await supabase
        .from('template_metadata')
        .select('*')
        .eq('template_id', templateId)
        .single()

      if (metadata) {
        await supabase
          .from('template_metadata')
          .update({
            total_sales: (metadata.total_sales || 0) + 1,
            total_revenue: (metadata.total_revenue || 0) + creatorEarnings / templateIds.length,
            total_downloads: (metadata.total_downloads || 0) + 1,
          })
          .eq('template_id', templateId)
      }
    }
  }

  console.log(`✅ Marketplace purchase completed: ${buyerId} → ${creatorId}, earnings: $${creatorEarnings}`)
}

// Helper function to handle marketplace charges (legacy Stripe Payments API)
async function handleMarketplaceCharge(charge: Stripe.Charge, supabase: any, type: 'sale' | 'refund') {
  const buyerId = charge.metadata?.buyer_id
  const creatorId = charge.metadata?.creator_id
  const templateIds = charge.metadata?.template_ids?.split(',') || []
  const bundleId = charge.metadata?.bundle_id
  const creatorEarnings = parseFloat(charge.metadata?.creator_earnings || '0')

  if (!buyerId || !creatorId) return

  // Update purchase status
  const status = type === 'sale' ? 'completed' : 'refunded'
  await supabase
    .from('template_purchases')
    .update({
      status,
      [type === 'sale' ? 'completed_at' : 'refunded_at']: new Date().toISOString(),
    })
    .eq('payment_intent_id', charge.payment_intent as string)

  // Update marketplace wallet
  const { data: wallet } = await supabase
    .from('marketplace_wallet')
    .select('*')
    .eq('creator_id', creatorId)
    .single()

  if (!wallet) return

  const walletAdjustment = type === 'sale' ? creatorEarnings : -creatorEarnings
  const newAvailableBalance = (wallet.available_balance || 0) + walletAdjustment
  const newTotalEarned = (wallet.total_earned || 0) + walletAdjustment

  await supabase
    .from('marketplace_wallet')
    .update({
      available_balance: Math.max(0, newAvailableBalance),
      total_earned: Math.max(0, newTotalEarned),
    })
    .eq('id', wallet.id)

  // Record transaction
  await supabase
    .from('marketplace_transactions')
    .insert({
      wallet_id: wallet.id,
      transaction_type: type,
      amount: walletAdjustment,
      reference_id: charge.id,
      description: type === 'sale' ? 'Sale' : 'Refund',
      created_at: new Date().toISOString(),
    })

  console.log(`${type === 'sale' ? '✅' : '⚠️'} Marketplace ${type}: ${creatorId}, amount: $${Math.abs(walletAdjustment)}`)
}

// ============================================================
// Search API Helpers (Cloudflare KV-based)
// ============================================================

const SEARCH_API_KV_NAMESPACE = 'e3b571cde10d48e38fdb107e0b9e2911'

async function kvPut(key: string, value: any): Promise<boolean> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const apiToken = process.env.CLOUDFLARE_API_TOKEN
  if (!accountId || !apiToken) {
    console.error('Search API webhook: Cloudflare credentials not configured')
    return false
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${SEARCH_API_KV_NAMESPACE}/values/${encodeURIComponent(key)}`
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(value),
  })
  return res.ok
}

async function kvGet(key: string): Promise<any | null> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const apiToken = process.env.CLOUDFLARE_API_TOKEN
  if (!accountId || !apiToken) return null

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${SEARCH_API_KV_NAMESPACE}/values/${encodeURIComponent(key)}`
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${apiToken}` },
  })
  if (!res.ok) return null
  try {
    return JSON.parse(await res.text())
  } catch {
    return null
  }
}

// Handle Search API checkout completion: store subscription in KV + auto-generate API key
async function handleSearchApiCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id
  const userEmail = session.metadata?.user_email
  const tier = session.metadata?.tier

  if (!userId || !tier) {
    console.error('Search API checkout: missing user_id or tier in metadata')
    return
  }

  // Store subscription in KV
  const subscriptionData = {
    tier,
    status: 'active',
    stripeCustomerId: session.customer as string,
    stripeSubscriptionId: session.subscription as string,
    periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const subStored = await kvPut(`user:${userId}:subscription`, subscriptionData)
  if (!subStored) {
    console.error(`Search API checkout: failed to store subscription for user ${userId}`)
    return
  }

  console.log(`Search API: Subscription stored for user ${userId}, tier: ${tier}`)

  // Auto-generate an API key for the paid user
  const prefix = 'pk_live_'
  const randomBytes = crypto.randomBytes(24).toString('hex')
  const apiKey = prefix + randomBytes
  const keyId = crypto.randomUUID()

  const keyData = {
    id: keyId,
    name: `${tier.charAt(0).toUpperCase() + tier.slice(1)} API Key`,
    tier,
    userId,
    userEmail: userEmail || '',
    createdAt: new Date().toISOString(),
    totalRequests: 0,
    lastUsedAt: null,
    revoked: false,
    rateLimit: tier === 'starter' ? 5000 : tier === 'pro' ? 10000 : 50000,
  }

  // Store the API key in KV
  const keyStored = await kvPut(apiKey, keyData)
  if (!keyStored) {
    console.error(`Search API checkout: failed to store API key for user ${userId}`)
    return
  }

  // Add key to user's key list
  const existingKeys: string[] = (await kvGet(`user:${userId}:keys`)) || []
  existingKeys.push(apiKey)
  await kvPut(`user:${userId}:keys`, existingKeys)

  console.log(`Search API: Auto-generated ${tier} API key for user ${userId}`)
}

// Handle Search API subscription updates (plan changes, renewals)
async function handleSearchApiSubscriptionUpdate(subscription: Stripe.Subscription) {
  const userId = subscription.metadata.user_id
  const tier = subscription.metadata.tier
  if (!userId) return

  const status = subscription.status
  const subAny = subscription as any
  const periodEnd = subAny.current_period_end
    ? new Date(subAny.current_period_end * 1000).toISOString()
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  const subscriptionData = {
    tier: tier || 'starter',
    status: status === 'active' || status === 'trialing' ? 'active' : status,
    stripeCustomerId: subscription.customer as string,
    stripeSubscriptionId: subscription.id,
    periodEnd,
    updatedAt: new Date().toISOString(),
  }

  // Merge with existing data to preserve createdAt
  const existing = await kvGet(`user:${userId}:subscription`)
  if (existing?.createdAt) {
    (subscriptionData as any).createdAt = existing.createdAt
  } else {
    (subscriptionData as any).createdAt = new Date().toISOString()
  }

  const stored = await kvPut(`user:${userId}:subscription`, subscriptionData)
  if (stored) {
    console.log(`Search API: Subscription updated for user ${userId}, status: ${status}, tier: ${tier}`)

    // If tier changed, update existing API keys to new tier rate limits
    if (tier && existing?.tier && tier !== existing.tier) {
      const userKeys: string[] = (await kvGet(`user:${userId}:keys`)) || []
      const newRateLimit = tier === 'starter' ? 5000 : tier === 'pro' ? 10000 : 50000
      for (const key of userKeys) {
        const keyData = await kvGet(key)
        if (keyData && !keyData.revoked) {
          keyData.tier = tier
          keyData.rateLimit = newRateLimit
          await kvPut(key, keyData)
        }
      }
      console.log(`Search API: Updated ${userKeys.length} API keys to tier ${tier}`)
    }
  }
}

// Handle Search API subscription cancellation
async function handleSearchApiSubscriptionDeleted(subscription: Stripe.Subscription) {
  const userId = subscription.metadata.user_id
  if (!userId) return

  // Update subscription status to cancelled but keep the record
  const existing = await kvGet(`user:${userId}:subscription`)
  const subscriptionData = {
    ...(existing || {}),
    tier: existing?.tier || 'free',
    status: 'cancelled',
    stripeSubscriptionId: null,
    updatedAt: new Date().toISOString(),
  }

  const stored = await kvPut(`user:${userId}:subscription`, subscriptionData)
  if (stored) {
    console.log(`Search API: Subscription cancelled for user ${userId}`)

    // Downgrade all API keys to free tier rate limits
    const userKeys: string[] = (await kvGet(`user:${userId}:keys`)) || []
    for (const key of userKeys) {
      const keyData = await kvGet(key)
      if (keyData && !keyData.revoked) {
        keyData.tier = 'free'
        keyData.rateLimit = 1000
        await kvPut(key, keyData)
      }
    }
    if (userKeys.length > 0) {
      console.log(`Search API: Downgraded ${userKeys.length} API keys to free tier`)
    }
  }
}
