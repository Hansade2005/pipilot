/**
 * PiPilot Search API - Stripe Configuration
 *
 * Pricing plans for the Search API product
 */

export const STRIPE_API_PLANS = {
  free: {
    name: 'Free',
    tier: 'free',
    price: 0,
    priceId: null, // No Stripe price for free tier
    productId: null,
    requests: 10_000,
    requestsDisplay: '10k requests/month',
    rateLimit: '10 req/min',
    features: [
      '10,000 requests/month',
      'All endpoints (search, extract, smart-search)',
      'AI-powered reranking',
      'Community support',
      '90%+ cache hit rate'
    ],
    cta: 'Get Started Free'
  },
  starter: {
    name: 'Starter',
    tier: 'starter',
    price: 29,
    priceId: 'price_1TA3al3G7U0M1bp13i0ZJRpJ',
    productId: 'prod_U8KFiBzqU8sSFJ',
    requests: 100_000,
    requestsDisplay: '100k requests/month',
    rateLimit: '100 req/min',
    features: [
      '100,000 requests/month',
      'All endpoints (search, extract, smart-search)',
      'AI-powered reranking',
      'Email support',
      '99.9% SLA',
      'Priority queue'
    ],
    cta: 'Upgrade to Starter',
    popular: true
  },
  pro: {
    name: 'Pro',
    tier: 'pro',
    price: 149,
    priceId: 'price_1TA3bD3G7U0M1bp1j647lG5d',
    productId: 'prod_U8KFSvIHon4TPZ',
    requests: 1_000_000,
    requestsDisplay: '1M requests/month',
    rateLimit: '500 req/min',
    features: [
      '1,000,000 requests/month',
      'All endpoints (search, extract, smart-search)',
      'AI-powered reranking',
      'Priority support',
      '99.99% SLA',
      'Custom rate limits',
      'Dedicated support channel',
      'Advanced analytics'
    ],
    cta: 'Upgrade to Pro'
  },
  enterprise: {
    name: 'Enterprise',
    tier: 'enterprise',
    price: null,
    priceId: null,
    productId: null,
    requests: -1, // Unlimited
    requestsDisplay: 'Unlimited requests',
    rateLimit: 'Custom',
    features: [
      'Unlimited requests',
      'All endpoints (search, extract, smart-search)',
      'AI-powered reranking',
      '24/7 dedicated support',
      '99.99% SLA with guarantees',
      'Custom deployment options',
      'White-label support',
      'Custom integrations',
      'Volume discounts',
      'SLA contracts'
    ],
    cta: 'Contact Sales'
  }
} as const;

export type ApiPlanTier = keyof typeof STRIPE_API_PLANS;

export const API_PLAN_ORDER: ApiPlanTier[] = ['free', 'starter', 'pro', 'enterprise'];
