/**
 * ABE Credit Manager - Core credit operations
 * Handles credit deduction, validation, and balance checks
 *
 * Payment Systems Integrated:
 * - Stripe: Primary payment system for subscriptions and credit top-ups
 * - Polar: Backup payment system (1 credit = $1, Product ID: 09991226-466e-4983-b409-c986577a8599)
 *
 * Credit Conversion Rate: 1 credit = $0.01 USD
 * Markup: 4x on actual API costs for profit margin + infrastructure
 */

import { SupabaseClient } from '@supabase/supabase-js'

// Credit constants - Token-based pricing system
// 1 credit = $0.01 (with 4x markup on API costs for profit margin)
export const CREDIT_TO_USD_RATE = 0.01 // 1 credit = $0.01 USD

// Monthly credits per plan - sustainable allocations
// Formula: plan_price / CREDIT_TO_USD_RATE * coverage_ratio
// Coverage ratio ensures we never give more credit value than revenue
export const FREE_PLAN_MONTHLY_CREDITS = 150       // ~$0.38 API cost, enough for ~3-5 complete tasks with cheap models
export const CREATOR_PLAN_MONTHLY_CREDITS = 1000   // ~$2.50 API cost, you charge $25
export const COLLABORATE_PLAN_MONTHLY_CREDITS = 2500 // ~$6.25 API cost, you charge $75
export const SCALE_PLAN_MONTHLY_CREDITS = 5000     // ~$12.50 API cost, you charge $150

// Per-model API pricing (cost per token via Vercel AI Gateway)
// These MUST match your actual Vercel AI Gateway / provider costs
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic models
  'anthropic/claude-sonnet-4.5':  { input: 0.000003,    output: 0.000015 },   // $3/$15 per 1M
  'anthropic/claude-haiku-4.5':   { input: 0.0000008,   output: 0.000004 },   // $0.80/$4 per 1M
  'anthropic/claude-opus-4.5':    { input: 0.000015,    output: 0.000075 },   // $15/$75 per 1M
  // Google models
  'google/gemini-2.5-flash':      { input: 0.000000075, output: 0.0000003 },  // $0.075/$0.30 per 1M
  'google/gemini-2.5-pro':        { input: 0.00000125,  output: 0.00001 },    // $1.25/$10 per 1M
  // xAI models
  'xai/grok-code-fast-1':         { input: 0.0000001,   output: 0.0000004 },  // $0.10/$0.40 per 1M
  'xai/glm-4.7':                  { input: 0.0000005,   output: 0.000002 },   // $0.50/$2 per 1M
  // Mistral models
  'mistral/devstral-2':           { input: 0.00000014,  output: 0.00000014 }, // $0.14/$0.14 per 1M
  'mistral/devstral-small-2':     { input: 0.0000001,   output: 0.0000001 },  // $0.10/$0.10 per 1M
  'codestral-latest':             { input: 0.0000003,   output: 0.0000009 },  // $0.30/$0.90 per 1M
  // OpenAI models
  'openai/gpt-5.1-thinking':      { input: 0.000003,   output: 0.000015 },   // $3/$15 per 1M
  'openai/gpt-5.2-codex':         { input: 0.000003,   output: 0.000015 },   // $3/$15 per 1M
  'openai/o3':                     { input: 0.000002,   output: 0.000008 },   // $2/$8 per 1M
  // Other models
  'moonshotai/kimi-k2-thinking':  { input: 0.0000005,  output: 0.000002 },   // $0.50/$2 per 1M
  'minimax/minimax-m2.1':         { input: 0.0000003,  output: 0.000001 },   // $0.30/$1 per 1M
  'alibaba/qwen3-max':            { input: 0.0000004,  output: 0.0000016 },  // $0.40/$1.60 per 1M
  'zai/glm-4.7-flash':            { input: 0.0000002,  output: 0.0000008 },  // $0.20/$0.80 per 1M
}

// Default pricing for unknown models (uses Claude Sonnet 4.5 pricing as safe default)
const DEFAULT_INPUT_COST_PER_TOKEN = 0.000003   // $3 per 1M input tokens
const DEFAULT_OUTPUT_COST_PER_TOKEN = 0.000015  // $15 per 1M output tokens

// 4x markup for sustainable profit margin (covers infrastructure, Vercel hosting, support, development)
const MARKUP_MULTIPLIER = 4

// Request limits per plan (safety against expensive operations)
export const MAX_CREDITS_PER_REQUEST = {
  free: 30,         // Enough for a complete simple task
  creator: 150,     // Allows moderate complexity
  collaborate: 250,  // Allows high complexity
  scale: 500        // Allows very high complexity
}

// Per-plan step limits to control agent costs
// A typical task needs: ~3-5 steps reading project + ~5-15 steps writing code + ~2-3 tool calls
// So minimum ~15 steps for a useful task. Lower than that = broken UX (premature stop, user forced to say "continue")
// Cost control comes from CREDITS (token-based billing), not step limits.
// Step limits are a safety net against infinite loops, not a billing mechanism.
export const MAX_STEPS_PER_PLAN: Record<string, number> = {
  free: 15,         // Enough to complete one simple task end-to-end
  creator: 30,      // Handles moderate multi-file tasks
  collaborate: 40,  // Complex multi-file refactors
  scale: 50         // Full agent capability for enterprise tasks
}

// Fallback for backward compatibility
export const MAX_STEPS_PER_REQUEST = 50

// Monthly request limits per plan (hard cap regardless of credits remaining)
// Prevents abuse: someone sending hundreds of tiny 1-credit messages, API hammering, etc.
// Set above what credits would naturally allow, so credits run out first in normal usage.
export const MAX_REQUESTS_PER_MONTH: Record<string, number> = {
  free: 20,          // Enough for a real trial (3-5 tasks, some follow-ups)
  creator: 250,      // ~8/day, covers daily development workflow
  collaborate: 600,  // ~20/day across a team
  scale: 2000        // ~65/day, enterprise-level usage
}

export interface WalletBalance {
  userId: string
  creditsBalance: number
  creditsUsedThisMonth: number
  creditsUsedTotal: number
  requestsThisMonth: number
  currentPlan: 'free' | 'creator' | 'collaborate' | 'scale'
  subscriptionStatus: 'active' | 'inactive' | 'cancelled' | 'past_due'
  canPurchaseCredits: boolean
}

export interface CreditDeductionResult {
  success: boolean
  newBalance: number
  creditsUsed: number
  error?: string
  errorCode?: 'INSUFFICIENT_CREDITS' | 'NO_WALLET' | 'INVALID_USER' | 'DATABASE_ERROR'
}

export interface UsageLogEntry {
  userId: string
  model: string
  creditsUsed: number
  requestType: string
  endpoint: string
  tokensUsed?: number
  promptTokens?: number
  completionTokens?: number
  stepsCount?: number
  responseTimeMs?: number
  status: 'success' | 'error' | 'timeout'
  errorMessage?: string
  metadata?: Record<string, any>
}

/**
 * Get the per-token pricing for a specific model.
 * Falls back to expensive default (Claude Sonnet) to prevent undercharging.
 */
export function getModelPricing(model: string): { input: number; output: number } {
  // Direct match
  if (MODEL_PRICING[model]) return MODEL_PRICING[model]

  // Try matching by partial name (e.g. 'claude-sonnet-4.5' -> 'anthropic/claude-sonnet-4.5')
  const normalizedModel = model.toLowerCase()
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (normalizedModel.includes(key.split('/').pop()!.toLowerCase()) ||
        key.toLowerCase().includes(normalizedModel)) {
      return pricing
    }
  }

  // Default to Claude Sonnet pricing (most expensive common model) to avoid undercharging
  console.warn(`[CreditManager] Unknown model "${model}" - using default Claude Sonnet pricing`)
  return { input: DEFAULT_INPUT_COST_PER_TOKEN, output: DEFAULT_OUTPUT_COST_PER_TOKEN }
}

/**
 * Calculate credits from actual token usage (AI SDK integration)
 * Returns credit cost based on real API usage with per-model pricing and 4x markup
 */
export function calculateCreditsFromTokens(
  promptTokens: number,
  completionTokens: number,
  model: string = 'anthropic/claude-sonnet-4.5'
): number {
  // Get model-specific pricing
  const pricing = getModelPricing(model)

  // Calculate actual API cost in USD using model-specific rates
  const apiCost = (promptTokens * pricing.input) +
                  (completionTokens * pricing.output)

  // Convert to credits: API cost in dollars * 100 (to get cents) * 4x markup
  const credits = Math.ceil(apiCost * 100 * MARKUP_MULTIPLIER)

  // Minimum 1 credit per request to prevent free usage
  return Math.max(1, credits)
}

/**
 * Get user wallet balance and plan info
 */
export async function getWalletBalance(
  userId: string,
  supabase: SupabaseClient
): Promise<WalletBalance | null> {
  try {
    const { data, error } = await supabase
      .from('wallet')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error) {
      console.error('[CreditManager] Error fetching wallet:', error)
      return null
    }

    if (!data) {
      // Create wallet if it doesn't exist (new user)
      const { data: newWallet, error: createError } = await supabase
        .from('wallet')
        .insert({
          user_id: userId,
          credits_balance: FREE_PLAN_MONTHLY_CREDITS,
          current_plan: 'free',
          subscription_status: 'inactive'
        })
        .select()
        .single()

      if (createError || !newWallet) {
        console.error('[CreditManager] Error creating wallet:', createError)
        return null
      }

      return {
        userId,
        creditsBalance: newWallet.credits_balance,
        creditsUsedThisMonth: newWallet.credits_used_this_month,
        creditsUsedTotal: newWallet.credits_used_total,
        requestsThisMonth: newWallet.requests_this_month || 0,
        currentPlan: newWallet.current_plan,
        subscriptionStatus: newWallet.subscription_status,
        canPurchaseCredits: false // Free plan cannot purchase
      }
    }

    return {
      userId,
      creditsBalance: data.credits_balance,
      creditsUsedThisMonth: data.credits_used_this_month,
      creditsUsedTotal: data.credits_used_total,
      requestsThisMonth: data.requests_this_month || 0,
      currentPlan: data.current_plan,
      subscriptionStatus: data.subscription_status,
      canPurchaseCredits: data.current_plan !== 'free' // Only paid plans can purchase
    }
  } catch (error) {
    console.error('[CreditManager] Exception in getWalletBalance:', error)
    return null
  }
}

/**
 * Check if user has sufficient credits
 */
export async function hasEnoughCredits(
  userId: string,
  creditsRequired: number,
  supabase: SupabaseClient
): Promise<boolean> {
  const wallet = await getWalletBalance(userId, supabase)
  
  if (!wallet) return false
  
  return wallet.creditsBalance >= creditsRequired
}

/**
 * Deduct credits from user wallet
 * @param creditsToDeduct - Number of credits to deduct (calculated from token usage)
 */
export async function deductCredits(
  userId: string,
  creditsToDeduct: number,
  metadata: Partial<UsageLogEntry> = {},
  supabase: SupabaseClient
): Promise<CreditDeductionResult> {
  try {
    // Get current wallet balance
    const wallet = await getWalletBalance(userId, supabase)

    if (!wallet) {
      return {
        success: false,
        newBalance: 0,
        creditsUsed: 0,
        error: 'Wallet not found',
        errorCode: 'NO_WALLET'
      }
    }

    // Check if user has enough credits
    if (wallet.creditsBalance < creditsToDeduct) {
      return {
        success: false,
        newBalance: wallet.creditsBalance,
        creditsUsed: 0,
        error: `Insufficient credits. Required: ${creditsToDeduct}, Available: ${wallet.creditsBalance}`,
        errorCode: 'INSUFFICIENT_CREDITS'
      }
    }

    // Deduct credits and increment request count (atomic operation)
    const { data: updatedWallet, error: updateError } = await supabase
      .from('wallet')
      .update({
        credits_balance: wallet.creditsBalance - creditsToDeduct,
        credits_used_this_month: wallet.creditsUsedThisMonth + creditsToDeduct,
        credits_used_total: wallet.creditsUsedTotal + creditsToDeduct,
        requests_this_month: (wallet.requestsThisMonth || 0) + 1
      })
      .eq('user_id', userId)
      .select()
      .single()

    if (updateError || !updatedWallet) {
      console.error('[CreditManager] Error updating wallet:', updateError)
      return {
        success: false,
        newBalance: wallet.creditsBalance,
        creditsUsed: 0,
        error: 'Failed to deduct credits',
        errorCode: 'DATABASE_ERROR'
      }
    }

    // Log the usage
    await logUsage({
      userId,
      model: metadata.model || 'unknown',
      creditsUsed: creditsToDeduct,
      requestType: metadata.requestType || 'chat',
      endpoint: metadata.endpoint || '/api/chat-v2',
      tokensUsed: metadata.tokensUsed,
      responseTimeMs: metadata.responseTimeMs,
      status: metadata.status || 'success',
      errorMessage: metadata.errorMessage,
      metadata: metadata.metadata
    }, supabase)

    // Log transaction
    await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        amount: -creditsToDeduct,
        type: 'usage',
        description: `${metadata.requestType || 'Chat'} request - ${metadata.model || 'unknown'} model`,
        credits_before: wallet.creditsBalance,
        credits_after: updatedWallet.credits_balance,
        metadata: metadata.metadata || {}
      })

    return {
      success: true,
      newBalance: updatedWallet.credits_balance,
      creditsUsed: creditsToDeduct
    }
  } catch (error) {
    console.error('[CreditManager] Exception in deductCredits:', error)
    return {
      success: false,
      newBalance: 0,
      creditsUsed: 0,
      error: 'Internal error',
      errorCode: 'DATABASE_ERROR'
    }
  }
}

/**
 * Log usage to usage_logs table
 */
export async function logUsage(
  entry: UsageLogEntry,
  supabase: SupabaseClient
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('usage_logs')
      .insert({
        user_id: entry.userId,
        model: entry.model,
        credits_used: entry.creditsUsed,
        request_type: entry.requestType,
        endpoint: entry.endpoint,
        tokens_used: entry.tokensUsed,
        prompt_tokens: entry.promptTokens,
        completion_tokens: entry.completionTokens,
        steps_count: entry.stepsCount,
        response_time_ms: entry.responseTimeMs,
        status: entry.status,
        error_message: entry.errorMessage,
        metadata: entry.metadata || {}
      })

    if (error) {
      console.error('[CreditManager] Error logging usage:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('[CreditManager] Exception in logUsage:', error)
    return false
  }
}

/**
 * Deduct credits based on actual token usage from AI SDK
 * Call this AFTER each AI request completes (generateText or streamText)
 * 
 * @example
 * const result = await generateText({ model, messages, tools, maxSteps: 15 })
 * await deductCreditsFromUsage(userId, result.usage, { model: 'claude-sonnet-4', requestType: 'chat', steps: result.steps.length }, supabase)
 */
export async function deductCreditsFromUsage(
  userId: string,
  usage: { promptTokens: number; completionTokens: number },
  metadata: {
    model: string
    requestType: string
    endpoint?: string
    steps?: number  // Number of tool call steps from AI SDK
    responseTimeMs?: number
    status?: 'success' | 'error' | 'timeout'
    errorMessage?: string
  },
  supabase: SupabaseClient
): Promise<CreditDeductionResult> {
  
  // Calculate actual credits based on token usage with markup
  const creditsToDeduct = calculateCreditsFromTokens(
    usage.promptTokens,
    usage.completionTokens,
    metadata.model
  )
  
  console.log(`[CreditManager] Calculated ${creditsToDeduct} credits from ${usage.promptTokens} input + ${usage.completionTokens} output tokens (${metadata.steps || 1} steps)`)
  
  // Use existing deductCredits function with enhanced metadata
  return deductCredits(
    userId,
    creditsToDeduct,
    {
      model: metadata.model,
      requestType: metadata.requestType,
      endpoint: metadata.endpoint || '/api/chat-v2',
      tokensUsed: usage.promptTokens + usage.completionTokens,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      stepsCount: metadata.steps || 1,
      responseTimeMs: metadata.responseTimeMs,
      status: metadata.status || 'success',
      errorMessage: metadata.errorMessage,
      metadata: {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        steps: metadata.steps,
        creditsCalculated: creditsToDeduct
      }
    },
    supabase
  )
}

/**
 * Check if request is within plan limits (safety check before making AI call)
 */
export async function checkRequestLimits(
  userId: string,
  estimatedCredits: number,
  requestedSteps: number,
  supabase: SupabaseClient
): Promise<{ allowed: boolean; reason?: string }> {
  const wallet = await getWalletBalance(userId, supabase)
  
  if (!wallet) {
    return { allowed: false, reason: 'Wallet not found' }
  }
  
  const maxCredits = MAX_CREDITS_PER_REQUEST[wallet.currentPlan] || MAX_CREDITS_PER_REQUEST.free
  const maxSteps = MAX_STEPS_PER_REQUEST
  
  if (estimatedCredits > maxCredits) {
    return { 
      allowed: false, 
      reason: `Request exceeds plan limit. Max ${maxCredits} credits per request for ${wallet.currentPlan} plan.` 
    }
  }
  
  if (requestedSteps > maxSteps) {
    return { 
      allowed: false, 
      reason: `Too many steps requested. Max ${maxSteps} steps for ${wallet.currentPlan} plan.` 
    }
  }
  
  return { allowed: true }
}

/**
 * Check if user has exceeded their monthly request limit.
 * Call this BEFORE making the AI call to block excessive usage.
 * Returns remaining requests if allowed, or an error with the limit info.
 */
export async function checkMonthlyRequestLimit(
  userId: string,
  supabase: SupabaseClient
): Promise<{ allowed: boolean; requestsUsed: number; requestsLimit: number; reason?: string }> {
  const wallet = await getWalletBalance(userId, supabase)

  if (!wallet) {
    return { allowed: false, requestsUsed: 0, requestsLimit: 0, reason: 'Wallet not found' }
  }

  const limit = MAX_REQUESTS_PER_MONTH[wallet.currentPlan] || MAX_REQUESTS_PER_MONTH.free
  const used = wallet.requestsThisMonth || 0

  if (used >= limit) {
    const message = wallet.currentPlan === 'free'
      ? `Monthly request limit reached (${limit} requests). Upgrade to a paid plan for more requests.`
      : `Monthly request limit reached (${limit} requests). Your limit resets next month, or upgrade your plan for more.`
    return { allowed: false, requestsUsed: used, requestsLimit: limit, reason: message }
  }

  return { allowed: true, requestsUsed: used, requestsLimit: limit }
}

/**
 * Add credits to user wallet (for purchases, bonuses, refunds)
 */
export async function addCredits(
  userId: string,
  creditsToAdd: number,
  type: 'subscription_grant' | 'purchase' | 'bonus' | 'refund' | 'adjustment',
  description: string,
  supabase: SupabaseClient,
  stripePaymentId?: string
): Promise<boolean> {
  try {
    // Get current wallet balance
    const wallet = await getWalletBalance(userId, supabase)

    if (!wallet) {
      console.error('[CreditManager] Wallet not found for user:', userId)
      return false
    }

    // Add credits
    const { data: updatedWallet, error: updateError } = await supabase
      .from('wallet')
      .update({
        credits_balance: wallet.creditsBalance + creditsToAdd
      })
      .eq('user_id', userId)
      .select()
      .single()

    if (updateError || !updatedWallet) {
      console.error('[CreditManager] Error adding credits:', updateError)
      return false
    }

    // Log transaction
    await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        amount: creditsToAdd,
        type,
        description,
        credits_before: wallet.creditsBalance,
        credits_after: updatedWallet.credits_balance,
        stripe_payment_id: stripePaymentId
      })

    console.log(`[CreditManager] Added ${creditsToAdd} credits to user ${userId}. New balance: ${updatedWallet.credits_balance}`)
    return true
  } catch (error) {
    console.error('[CreditManager] Exception in addCredits:', error)
    return false
  }
}

/**
 * Update user plan and grant monthly credits
 */
export async function updateUserPlan(
  userId: string,
  plan: 'free' | 'creator' | 'collaborate' | 'scale',
  subscriptionStatus: 'active' | 'inactive' | 'cancelled' | 'past_due',
  supabase: SupabaseClient,
  stripeCustomerId?: string,
  stripeSubscriptionId?: string
): Promise<boolean> {
  try {
    const wallet = await getWalletBalance(userId, supabase)

    if (!wallet) {
      console.error('[CreditManager] Wallet not found for user:', userId)
      return false
    }

    // Determine monthly credits for the plan
    let monthlyCredits = 0
    switch (plan) {
      case 'free':
        monthlyCredits = FREE_PLAN_MONTHLY_CREDITS
        break
      case 'creator':
        monthlyCredits = CREATOR_PLAN_MONTHLY_CREDITS
        break
      case 'collaborate':
        monthlyCredits = COLLABORATE_PLAN_MONTHLY_CREDITS
        break
      case 'scale':
        monthlyCredits = SCALE_PLAN_MONTHLY_CREDITS
        break
    }

    // Update wallet with new plan
    const { error } = await supabase
      .from('wallet')
      .update({
        current_plan: plan,
        subscription_status: subscriptionStatus,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        credits_balance: wallet.creditsBalance + monthlyCredits
      })
      .eq('user_id', userId)

    if (error) {
      console.error('[CreditManager] Error updating plan:', error)
      return false
    }

    // Log transaction for plan upgrade
    await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        amount: monthlyCredits,
        type: 'subscription_grant',
        description: `Monthly credits for ${plan} plan`,
        credits_before: wallet.creditsBalance,
        credits_after: wallet.creditsBalance + monthlyCredits,
        stripe_subscription_id: stripeSubscriptionId
      })

    console.log(`[CreditManager] Updated user ${userId} to ${plan} plan with ${monthlyCredits} credits`)
    return true
  } catch (error) {
    console.error('[CreditManager] Exception in updateUserPlan:', error)
    return false
  }
}

/**
 * Get user usage analytics
 */
export async function getUserUsageStats(
  userId: string,
  supabase: SupabaseClient,
  startDate?: Date,
  endDate?: Date
): Promise<{
  totalCreditsUsed: number
  totalRequests: number
  avgCreditsPerRequest: number
  modelBreakdown: Record<string, number>
} | null> {
  try {
    let query = supabase
      .from('usage_logs')
      .select('*')
      .eq('user_id', userId)

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString())
    }

    if (endDate) {
      query = query.lte('created_at', endDate.toISOString())
    }

    const { data, error } = await query

    if (error || !data) {
      console.error('[CreditManager] Error fetching usage stats:', error)
      return null
    }

    const totalCreditsUsed = data.reduce((sum: number, log: any) => sum + parseFloat(log.credits_used.toString()), 0)
    const totalRequests = data.length
    const avgCreditsPerRequest = totalRequests > 0 ? totalCreditsUsed / totalRequests : 0

    // Model breakdown
    const modelBreakdown: Record<string, number> = {}
    data.forEach((log: any) => {
      const model = log.model || 'unknown'
      modelBreakdown[model] = (modelBreakdown[model] || 0) + parseFloat(log.credits_used.toString())
    })

    return {
      totalCreditsUsed,
      totalRequests,
      avgCreditsPerRequest,
      modelBreakdown
    }
  } catch (error) {
    console.error('[CreditManager] Exception in getUserUsageStats:', error)
    return null
  }
}
