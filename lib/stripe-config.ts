// Stripe Product and Pricing Configuration
// This file defines all our products, prices, and features

import { chatModels } from '@/lib/ai-models'
import { getExchangeRates, convertUsdToCad, formatPrice } from '@/lib/currency-converter'

// Get all available model IDs for premium plans
const ALL_MODEL_IDS = chatModels.map(model => model.id)

export interface ProductConfig {
  id: string
  name: string
  description: string
  features: string[]
  limits: {
    credits: number
    requestsPerMonth: number
    messages: number
    deploymentPlatforms: string[]
    deploymentsPerMonth: number
    githubPushesPerMonth?: number
    canUseVercel: boolean
    canUseNetlify: boolean
    canUseGitHub: boolean
    unlimitedPrompts: boolean
    allowedModels: string[]
    storage?: string
    users?: number
    canPurchaseCredits: boolean
  }
  prices: {
    monthly: {
      amount: number
      stripePriceId: string
    }
    yearly: {
      amount: number
      stripePriceId: string
      savings: string
    }
  }
}

export const PRODUCT_CONFIGS: Record<string, ProductConfig> = {
  free: {
    id: 'free',
    name: 'Free',
    description: 'Community Tier',
    features: [
      'Basic AI chat & code generation',
      '150 monthly credits (~5-10 AI messages)',
      'Token-based billing (pay for what you use)',
      'Deploy to Vercel',
      'Visual editing with Design Mode',
      'GitHub sync',
      '1 app/project',
      'Public/open-source unlimited'
    ],
    limits: {
      credits: 150,
      requestsPerMonth: 20,
      messages: 9999, // No hard message limit, only credit-based
      deploymentPlatforms: ['vercel'],
      deploymentsPerMonth: 5,
      githubPushesPerMonth: 2,
      canUseVercel: true,
      canUseNetlify: false,
      canUseGitHub: true,
      unlimitedPrompts: false,
      allowedModels: ['xai/grok-code-fast-1', 'mistral/devstral-2', 'mistral/devstral-small-2', 'ollama/nemotron-3-super', 'ollama/devstral-2:123b', 'ollama/minimax-m2.5', 'ollama/minimax-m2.1'],
      canPurchaseCredits: false
    },
    prices: {
      monthly: {
        amount: 0,
        stripePriceId: 'price_1SZ9843G7U0M1bp1WcX6j6b1'
      },
      yearly: {
        amount: 0,
        stripePriceId: 'price_1SZ9843G7U0M1bp1WcX6j6b1',
        savings: '0%'
      }
    }
  },
  creator: {
    id: 'creator',
    name: 'Creator',
    description: 'Individual Tier',
    features: [
      'All Free features',
      '1,000 monthly credits (~50-100 messages)',
      'Token-based billing - only pay for actual usage',
      'Access to all premium AI models (Claude, GPT, Gemini)',
      '5x higher attachment size limits',
      'Browser testing & screenshots',
      'Code review & security audit',
      'Health check & diagnostics',
      'Remove PiPilot badge',
      '10% revenue share on monetized apps',
      'Purchase extra credits anytime ($0.01/credit)'
    ],
    limits: {
      credits: 1000,
      requestsPerMonth: 250,
      messages: 9999,
      deploymentPlatforms: ['vercel', 'netlify'],
      deploymentsPerMonth: 10,
      canUseVercel: true,
      canUseNetlify: true,
      canUseGitHub: true,
      unlimitedPrompts: true,
      allowedModels: ALL_MODEL_IDS,
      storage: 'Unlimited',
      canPurchaseCredits: true
    },
    prices: {
      monthly: {
        amount: 25,
        stripePriceId: 'price_1T7WAW3G7U0M1bp1O7nCecM6'
      },
      yearly: {
        amount: 240,
        stripePriceId: 'price_1T7WAZ3G7U0M1bp1glBFKEUN',
        savings: 'Save 20% ($60/yr)'
      }
    }
  },
  collaborate: {
    id: 'collaborate',
    name: 'Collaborate',
    description: 'Team Tier',
    features: [
      'All Creator features',
      '2,500 monthly credits (~125-250 messages)',
      'Shared credit pool across unlimited users',
      'Centralized billing on Vercel',
      'Share chats and collaborate in real-time',
      'User roles & permissions',
      '15% revenue share on apps',
      'Purchase extra credits (shared pool)'
    ],
    limits: {
      credits: 2500,
      requestsPerMonth: 600,
      messages: 9999,
      deploymentPlatforms: ['vercel', 'netlify'],
      deploymentsPerMonth: 20,
      canUseVercel: true,
      canUseNetlify: true,
      canUseGitHub: true,
      unlimitedPrompts: true,
      allowedModels: ALL_MODEL_IDS,
      storage: 'Unlimited',
      users: 100,
      canPurchaseCredits: true
    },
    prices: {
      monthly: {
        amount: 75,
        stripePriceId: 'price_1T7WAc3G7U0M1bp1Gpt1YiRJ'
      },
      yearly: {
        amount: 720,
        stripePriceId: 'price_1T7WAf3G7U0M1bp1TnSnwlCl',
        savings: 'Save 20% ($180/yr)'
      }
    }
  },
  scale: {
    id: 'scale',
    name: 'Scale',
    description: 'Enterprise Tier',
    features: [
      'All Collaborate features',
      '5,000 monthly credits (~250-500 messages)',
      'Priority AI model access',
      'Internal publish',
      'SSO integration',
      'Personal projects workspace',
      'Opt out of data training',
      'Premium design templates',
      '20% revenue share on apps',
      'Purchase extra credits (shared pool)'
    ],
    limits: {
      credits: 5000,
      requestsPerMonth: 2000,
      messages: 9999,
      deploymentPlatforms: ['vercel', 'netlify'],
      deploymentsPerMonth: 50,
      canUseVercel: true,
      canUseNetlify: true,
      canUseGitHub: true,
      unlimitedPrompts: true,
      allowedModels: ALL_MODEL_IDS,
      storage: 'Unlimited',
      users: 1000,
      canPurchaseCredits: true
    },
    prices: {
      monthly: {
        amount: 150,
        stripePriceId: 'price_1T7WAh3G7U0M1bp1yEEFrdqV'
      },
      yearly: {
        amount: 1440,
        stripePriceId: 'price_1T7WAk3G7U0M1bp1YEJ8VTs6',
        savings: 'Save 20% ($360/yr)'
      }
    }
  }
}

// Extra Credits Product
export const EXTRA_CREDITS_PRODUCT = {
  id: 'extra-credits',
  name: 'Extra Credits',
  description: 'Purchase additional credits for paid plans',
  stripePriceId: 'price_1T6lsK3G7U0M1bp19R0ZutUh',
  pricePerCredit: 0.01, // 1 credit = $0.01 USD
  pricePerCreditCents: 1, // 1 credit = 1 cent
}

// Helper functions
export function getProductConfig(planId: string): ProductConfig | null {
  return PRODUCT_CONFIGS[planId] || null
}

export function getPriceId(planId: string, isAnnual: boolean): string | null {
  const config = getProductConfig(planId)
  if (!config) return null

  return isAnnual ? config.prices.yearly.stripePriceId : config.prices.monthly.stripePriceId
}

export function getPrice(planId: string, isAnnual: boolean): number {
  const config = getProductConfig(planId)
  if (!config) return 0

  return isAnnual ? config.prices.yearly.amount : config.prices.monthly.amount
}

export function getSavings(planId: string, isAnnual: boolean): string | null {
  if (!isAnnual) return null

  const config = getProductConfig(planId)
  if (!config) return null

  return config.prices.yearly.savings
}

export function getLimits(planId: string) {
  const config = getProductConfig(planId)
  return config?.limits || {
    credits: 150,
    requestsPerMonth: 20,
    messages: 80,
    deploymentPlatforms: ['vercel'],
    deploymentsPerMonth: 5,
    githubPushesPerMonth: 2,
    canUseVercel: true,
    canUseNetlify: false,
    canUseGitHub: true,
    unlimitedPrompts: false,
    allowedModels: ['auto'],
    canPurchaseCredits: false
  }
}

export function canUseModel(planId: string, modelId: string): boolean {
  const limits = getLimits(planId)
  return limits.allowedModels.includes(modelId)
}

export function canPurchaseCredits(planId: string): boolean {
  const limits = getLimits(planId)
  return limits.canPurchaseCredits
}

// Stripe Product IDs (hardcoded)
export const STRIPE_PRODUCT_IDS = {
  FREE: 'prod_TWBUUaESS42Lhe',
  CREATOR: 'prod_TWBVaEqAk1898D',
  COLLABORATE: 'prod_TWBVEKvyCu0hYP',
  SCALE: 'prod_TWBVHmYvmfFQMA',
  EXTRA_CREDITS: 'prod_TWBWlx7GadNZK1'
}

// Currency conversion helpers for CAD display
export async function getPriceInCAD(usdPrice: number): Promise<number> {
  try {
    const rates = await getExchangeRates()
    return convertUsdToCad(usdPrice, rates.CAD)
  } catch (error) {
    console.error('Failed to get CAD price:', error)
    // Fallback to approximate conversion
    return parseFloat((usdPrice * 1.35).toFixed(2))
  }
}

export async function formatPriceForDisplay(usdPrice: number, currency: 'USD' | 'CAD' = 'CAD'): Promise<string> {
  if (currency === 'USD') {
    return formatPrice(usdPrice, 'USD')
  }
  
  const cadPrice = await getPriceInCAD(usdPrice)
  return formatPrice(cadPrice, 'CAD')
}

export async function getExchangeRateForDisplay(): Promise<number> {
  try {
    const rates = await getExchangeRates()
    return rates.CAD
  } catch (error) {
    return 1.35
  }
}
