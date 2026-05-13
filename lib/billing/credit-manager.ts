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
import { getVercelModelPricing, VERCEL_MODEL_PRICING } from './model-pricing-data'

// Model name disguise map for user-facing descriptions
const MODEL_DISGUISE: Record<string, string> = {
  'ollama/nemotron-3-super': 'Titan Pro',
  'ollama/minimax-m2.5': 'Atlas M2.5',
  'ollama/minimax-m2.1': 'Atlas M2.1',
  'ollama/cogito-2.1:671b': 'Cogito 671B',
  'ollama/gemma4:31b': 'Gemma 4',
  'ollama/gpt-oss:120b': 'Nova 120B',
  'ollama/gpt-oss:20b': 'Nova Flash',
}

function disguiseModelName(modelId: string): string {
  return MODEL_DISGUISE[modelId] || modelId
}

// Credit constants - Hybrid pricing: per-step (fixed) + token-based (variable) billing
// 1 credit = $0.01 USD
export const CREDIT_TO_USD_RATE = 0.01 // 1 credit = $0.01 USD

// Monthly credits per plan
export const FREE_PLAN_MONTHLY_CREDITS = 150
export const CREATOR_PLAN_MONTHLY_CREDITS = 1000
export const COLLABORATE_PLAN_MONTHLY_CREDITS = 2500
export const SCALE_PLAN_MONTHLY_CREDITS = 5000

// Per-model API pricing is now sourced from the comprehensive model-pricing-data.ts
// which contains 100+ models with full Vercel AI Gateway pricing, verified 2026-02-14.
// Legacy MODEL_PRICING export is derived from VERCEL_MODEL_PRICING for backward compatibility.
export const MODEL_PRICING: Record<string, { input: number; output: number }> = Object.fromEntries(
  Object.entries(VERCEL_MODEL_PRICING).map(([key, entry]) => [
    key,
    { input: entry.inputPerToken, output: entry.outputPerToken }
  ])
)

// 4x markup for profit margin (covers infrastructure, Vercel hosting, support, development)
const MARKUP_MULTIPLIER = 4

// =============================================================================
// PER-STEP PRICING TIERS
// =============================================================================
// Fixed per-step credit cost replaces variable token-based billing for predictability.
// Each model is assigned a tier based on its API cost. Free models (Kilo) = pure profit.
//
// Tier       | Credits/Step | USD/Step | Target Models               | Margin
// -----------|-------------|----------|-----------------------------|---------
// free       | 10          | $0.10    | Kilo free models            | 100%
// economy    | 10          | $0.10    | Devstral, Grok Fast, GLM    | ~90%
// standard   | 15          | $0.15    | Gemini Flash, Haiku, Qwen   | ~75%
// pro        | 25          | $0.25    | Sonnet, Codex, GPT-5        | ~65%
// ultra      | 50          | $0.50    | Opus, O3, Gemini Pro        | ~70%

export type StepPricingTier = 'free' | 'economy' | 'standard' | 'pro' | 'ultra'

export const STEP_CREDITS_BY_TIER: Record<StepPricingTier, number> = {
  free: 10,      // $0.10/step - Kilo free models (API cost: $0)
  economy: 10,   // $0.10/step - Budget models (API cost: ~$0.01)
  standard: 15,  // $0.15/step - Mid-range models (API cost: ~$0.03-0.05)
  pro: 25,       // $0.25/step - Premium models (API cost: ~$0.08-0.12)
  ultra: 50,     // $0.50/step - Top-tier models (API cost: ~$0.15-0.25)
}

// Model-to-tier mapping. Every model gets a tier for per-step billing.
const MODEL_STEP_TIER: Record<string, StepPricingTier> = {
  // Kilo free models (API cost: $0)
  'kilo/auto-free': 'free',
  'kilo/minimax-m2.5-free': 'free',
  'kilo/kimi-k2.5-free': 'free',
  'kilo/giga-potato': 'free',
  'kilo/step-3.5-flash-free': 'free',

  // Economy tier (cheap API models, ~$0.005-0.02 per step)
  'auto': 'economy',
  'a0-dev-llm': 'economy',
  'pixtral-12b-2409': 'economy',
  'mistral/devstral-2': 'economy',
  'mistral/devstral-small-2': 'economy',
  'xai/grok-code-fast-1': 'economy',
  'zai/glm-4.7-flash': 'economy',
  'zai/glm-4.6': 'economy',
  'kwaipilot/kat-coder-pro-v1': 'economy',
  'minimax/minimax-m2.1': 'economy',
  'codestral-latest': 'economy',
  'ollama/nemotron-3-super': 'economy',
  'ollama/devstral-2:123b': 'economy',
  'ollama/minimax-m2.5': 'economy',
  'ollama/minimax-m2.1': 'economy',
  'ollama/cogito-2.1:671b': 'economy',
  'ollama/gemma4:31b': 'economy',
  'ollama/glm-4.6': 'economy',
  'ollama/gpt-oss:120b': 'economy',
  'ollama/gpt-oss:20b': 'economy',
  'ollama/qwen3-vl:235b': 'economy',
  'ollama/nemotron-3-nano:30b': 'economy',

  // Standard tier (mid-range models, ~$0.03-0.05 per step)
  'google/gemini-2.5-flash': 'standard',
  'anthropic/claude-haiku-4.5': 'standard',
  'alibaba/qwen3-max': 'standard',
  'alibaba/qwen3-vl-thinking': 'standard',
  'moonshotai/kimi-k2-thinking': 'standard',
  'openai/gpt-oss-120b': 'standard',
  'xai/grok-4.1-fast-reasoning': 'standard',
  'xai/grok-4.1-fast-non-reasoning': 'standard',

  // Pro tier (premium models, ~$0.08-0.12 per step)
  'anthropic/claude-sonnet-4.5': 'pro',
  'openai/gpt-5.1-thinking': 'pro',
  'openai/gpt-5.2-codex': 'pro',

  // Ultra tier (top-tier models, ~$0.15-0.25 per step)
  'anthropic/claude-opus-4.5': 'ultra',
  'openai/o3': 'ultra',
  'google/gemini-2.5-pro': 'ultra',
}

/**
 * Get the per-step pricing tier for a model.
 * Returns null if the model uses token-based billing (fallback).
 */
export function getModelStepTier(modelId: string): StepPricingTier | null {
  return MODEL_STEP_TIER[modelId] || null
}

/**
 * Get the fixed per-step credit cost for a model.
 * Returns null if the model should use token-based billing instead.
 */
export function getFixedStepCredits(modelId: string): number | null {
  const tier = getModelStepTier(modelId)
  if (!tier) return null
  return STEP_CREDITS_BY_TIER[tier]
}

/**
 * Check if a model uses per-step pricing (vs token-based).
 */
export function isPerStepPricingModel(modelId: string): boolean {
  return modelId in MODEL_STEP_TIER
}

// ─── Step-type-based pricing ─────────────────────────────────────────────
// Not all steps cost the same. Read/explore steps are cheap context gathering,
// while code generation steps produce real value and cost more API tokens.
//
// Step Type       | Credits | Rationale
// ----------------|---------|------------------------------------------
// read-only       | 2       | Just reading files / searching — tiny output
// text-generation | 5       | AI text response, no tool use
// tool-call-file  | full    | Write/edit/delete files — real code generation
// tool-call-direct| full    | External APIs, install, web search, etc.
// mixed           | full    | Both file + direct tools in one step

const STEP_TYPE_CREDITS: Record<StepType, number | null> = {
  'read-only': 2,         // Cheap: just reading/searching
  'text-generation': 5,   // Mid: AI responds without tools
  'tool-call-file': null,  // Full tier cost (write/edit/delete)
  'tool-call-direct': null, // Full tier cost (external tools)
  'mixed': null,           // Full tier cost
}

/**
 * Get the credit cost for a step based on its type and model tier.
 * Read-only and text-generation steps get discounted flat rates.
 * Code generation / tool execution steps pay the full model tier cost.
 */
export function getStepCreditsByType(modelId: string, stepType: StepType): number {
  const discountedCost = STEP_TYPE_CREDITS[stepType]
  if (discountedCost !== null) return discountedCost

  // Full tier cost for code generation steps
  return getFixedStepCredits(modelId) ?? 10
}

// Per-request credit budget per plan (max credits ONE request can consume)
// Set high enough that the agent can actually finish tasks without being cut short.
// Users are already billed per-token - this just prevents a single runaway request
// from draining the entire monthly balance.
export const MAX_CREDITS_PER_REQUEST: Record<string, number> = {
  free: 75,         // ~50% of 150 monthly credits (enough for a real task)
  creator: 500,     // ~50% of 1,000 monthly credits (~$5 API cost)
  collaborate: 1250, // ~50% of 2,500 monthly credits (~$12.50 API cost)
  scale: 2500       // ~50% of 5,000 monthly credits (~$25 API cost)
}

// Flat per-plan step limits. No model-based tier throttling.
// Token-based billing + MAX_CREDITS_PER_REQUEST are the real cost controls.
// Steps just cap how many tool-call rounds the AI can make in one request.
const STEPS_BY_PLAN: Record<string, number> = {
  free: 100,
  creator: 100,
  collaborate: 100,
  scale: 100,
}

/**
 * Get the max steps allowed for a given plan.
 * Model cost no longer reduces steps - billing handles cost control.
 */
export function getMaxStepsForRequest(plan: string, _model: string): number {
  return STEPS_BY_PLAN[plan] || STEPS_BY_PLAN.free
}

// Legacy exports for backward compatibility
export const MAX_STEPS_PER_PLAN: Record<string, number> = STEPS_BY_PLAN
export const MAX_STEPS_PER_REQUEST = 100

/**
 * Estimate the credit cost of one agent step for a given model.
 * Per-step models return their fixed tier cost.
 * Token-based models estimate from typical token usage (~35K input, ~400 output).
 */
export function estimateCreditsPerStep(model: string): number {
  // Per-step pricing: return the fixed credit cost
  const fixedCost = getFixedStepCredits(model)
  if (fixedCost !== null) return fixedCost

  // Token-based fallback
  const pricing = getModelPricing(model)
  const typicalInputTokens = 35000
  const typicalOutputTokens = 400
  const apiCost = (typicalInputTokens * pricing.input) + (typicalOutputTokens * pricing.output)
  return Math.ceil(apiCost * 100 * MARKUP_MULTIPLIER)
}

// ─── Tool classification for per-step billing ───────────────────────────
// File tools run in-memory via constructToolResult (cheap, no external calls)
const CONSTRUCT_TOOL_RESULT_TOOLS = new Set([
  'write_file', 'read_file', 'delete_file', 'delete_folder',
  'edit_file', 'client_replace_string_in_file', 'remove_package',
  'pipilotdb_create_database', 'request_supabase_connection',
  'continue_backend_implementation',
])

// Read-only / exploration tools (very cheap — no code generation, just context gathering)
const READ_ONLY_TOOLS = new Set([
  'read_file', 'list_files', 'grep_search', 'semantic_code_navigator',
  'check_dev_errors',
])

// Direct-execute tools that do real work (external APIs, search, etc.)
const DIRECT_EXECUTE_TOOLS = new Set([
  'semantic_code_navigator', 'grep_search', 'list_files',
  'web_search', 'web_extract', 'browse_web',
  'check_dev_errors', 'node_machine', 'install_packages',
  'generate_image', 'generate_plan', 'code_review',
  'code_quality_analysis', 'auto_documentation', 'update_plan_progress',
  'update_project_context',
  // Database tools
  'pipilotdb_query_database', 'pipilotdb_manipulate_table_data',
  'pipilotdb_manage_api_keys', 'pipilotdb_list_tables',
  'pipilotdb_read_table', 'pipilotdb_delete_table',
  'pipilotdb_create_table',
  // Supabase tools
  'supabase_fetch_api_keys', 'supabase_create_table',
  'supabase_insert_data', 'supabase_delete_data',
  'supabase_read_table', 'supabase_drop_table',
  'supabase_execute_sql', 'supabase_list_tables_rls',
  // Stripe tools
  'stripe_validate_key', 'stripe_list_products',
  'stripe_create_product', 'stripe_list_prices',
  'stripe_list_customers', 'stripe_list_subscriptions',
])

export type StepType = 'tool-call-file' | 'tool-call-direct' | 'text-generation' | 'mixed' | 'read-only'

/**
 * Classify a step based on the tools it used.
 */
export function classifyStep(toolsUsed: string[]): StepType {
  if (toolsUsed.length === 0) return 'text-generation'

  // If ALL tools in this step are read-only, classify as read-only (cheap)
  const allReadOnly = toolsUsed.every(t => READ_ONLY_TOOLS.has(t))
  if (allReadOnly) return 'read-only'

  const hasFileTools = toolsUsed.some(t => CONSTRUCT_TOOL_RESULT_TOOLS.has(t))
  const hasDirectTools = toolsUsed.some(t => DIRECT_EXECUTE_TOOLS.has(t) || !CONSTRUCT_TOOL_RESULT_TOOLS.has(t))

  if (hasFileTools && hasDirectTools) return 'mixed'
  if (hasFileTools) return 'tool-call-file'
  return 'tool-call-direct'
}

/**
 * Estimate tokens for a step when the provider reports 0 usage.
 * Uses step type + content length for accurate estimation.
 *
 * - text-generation: full context re-sent as input, output from generated text
 * - tool-call-file: context re-sent, output = tool args + small result (in-memory)
 * - tool-call-direct: context re-sent, output = tool args + larger result
 * - mixed: combination of both
 */
export function estimateStepTokens(
  stepType: StepType,
  contextChars: number,
  outputChars: number,
  toolResultChars: number = 0
): { inputTokens: number; outputTokens: number } {
  // Input: the full conversation context is re-sent every step (~4 chars/token)
  const inputTokens = Math.ceil(contextChars / 4)

  // Output: AI-generated text + tool call arguments (~4 chars/token)
  let outputTokens = Math.ceil(outputChars / 4)

  // Tool results count as input tokens for the NEXT step, but we charge
  // them here since this step triggered the tool execution
  if (toolResultChars > 0) {
    // Tool results are typically verbose (file contents, search results, etc.)
    // Count them at input token rate since they get fed back as context
    outputTokens += Math.ceil(toolResultChars / 4)
  }

  // Minimum output: even a pure tool-call step generates the function call JSON
  if (outputTokens === 0 && stepType !== 'text-generation') {
    outputTokens = 50  // Minimum for a tool call invocation
  }

  return { inputTokens, outputTokens }
}

/**
 * Calculate the max steps a user can afford for a given model.
 * Uses the flat plan step limit - billing deducts actual token cost after each request.
 * Only blocks if user literally has 0 credits remaining.
 */
export function getAffordableSteps(
  plan: string,
  model: string,
  remainingCredits: number
): { maxSteps: number; estimatedCostPerStep: number; totalEstimatedCost: number } {
  const planMaxSteps = getMaxStepsForRequest(plan, model)
  const costPerStep = estimateCreditsPerStep(model)

  // Only reduce steps if user is nearly out of credits entirely
  // (less than 1 step worth of credits remaining)
  const maxSteps = (costPerStep > 0 && remainingCredits < costPerStep)
    ? 1  // Allow at least 1 step so user gets a response
    : planMaxSteps

  return {
    maxSteps,
    estimatedCostPerStep: costPerStep,
    totalEstimatedCost: maxSteps * costPerStep
  }
}

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
  status: 'success' | 'error' | 'timeout' | 'aborted'
  errorMessage?: string
  metadata?: Record<string, any>
}

/**
 * Get the per-token pricing for a specific model.
 * Delegates to comprehensive VERCEL_MODEL_PRICING data (100+ models) with fuzzy matching.
 * Falls back to Claude Sonnet 4.5 pricing to prevent undercharging.
 */
export function getModelPricing(model: string): { input: number; output: number } {
  const pricing = getVercelModelPricing(model)
  return { input: pricing.input, output: pricing.output }
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
  // Get model-specific per-token pricing (USD per token)
  const pricing = getModelPricing(model)

  // Calculate actual API cost in USD using model-specific rates
  const apiCost = (promptTokens * pricing.input) + (completionTokens * pricing.output)

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
  metadata: Partial<UsageLogEntry> & { skipRequestIncrement?: boolean } = {},
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

    // If balance is 0 or negative, stop immediately
    if (wallet.creditsBalance <= 0) {
      return {
        success: false,
        newBalance: wallet.creditsBalance,
        creditsUsed: 0,
        error: 'No credits remaining',
        errorCode: 'INSUFFICIENT_CREDITS'
      }
    }

    // Partial deduction: if user can't afford the full cost, deduct what's available
    const actualDeduction = Math.min(creditsToDeduct, wallet.creditsBalance)

    // Build update object - only increment request count for full requests, not per-step
    const updateData: Record<string, any> = {
      credits_balance: wallet.creditsBalance - actualDeduction,
      credits_used_this_month: wallet.creditsUsedThisMonth + actualDeduction,
      credits_used_total: wallet.creditsUsedTotal + actualDeduction,
    }
    if (!metadata.skipRequestIncrement) {
      updateData.requests_this_month = (wallet.requestsThisMonth || 0) + 1
    }

    // Deduct credits
    const { data: updatedWallet, error: updateError } = await supabase
      .from('wallet')
      .update(updateData)
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
      model: disguiseModelName(metadata.model || 'unknown'),
      creditsUsed: actualDeduction,
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
        amount: -actualDeduction,
        type: 'usage',
        description: `${metadata.requestType || 'Chat'} request - ${disguiseModelName(metadata.model || 'unknown')} model`,
        credits_before: wallet.creditsBalance,
        credits_after: updatedWallet.credits_balance,
        metadata: metadata.metadata || {}
      })

    return {
      success: true,
      newBalance: updatedWallet.credits_balance,
      creditsUsed: actualDeduction
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
 * When isByok is true, no credits are deducted but usage is still logged for analytics.
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
    status?: 'success' | 'error' | 'timeout' | 'aborted'
    errorMessage?: string
    isByok?: boolean  // BYOK mode - log usage but don't deduct credits
    skipRequestIncrement?: boolean  // Per-step billing: don't count each step as a separate request
  },
  supabase: SupabaseClient
): Promise<CreditDeductionResult> {

  // BYOK mode: log usage for analytics but don't deduct any credits
  if (metadata.isByok) {
    console.log(`[CreditManager] BYOK mode - logging usage without credit deduction: ${usage.promptTokens} input + ${usage.completionTokens} output tokens (${metadata.model})`)

    // Still log to usage_logs for analytics/tracking
    await logUsage({
      userId,
      model: disguiseModelName(metadata.model),
      creditsUsed: 0,
      requestType: metadata.requestType + '-byok',
      endpoint: metadata.endpoint || '/api/chat-v2',
      tokensUsed: usage.promptTokens + usage.completionTokens,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      stepsCount: metadata.steps || 1,
      responseTimeMs: metadata.responseTimeMs,
      status: metadata.status || 'success',
      errorMessage: metadata.errorMessage,
      metadata: {
        byok: true,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        steps: metadata.steps,
      }
    }, supabase)

    // Return success with no deduction
    return {
      success: true,
      newBalance: -1, // Sentinel: BYOK mode, balance not applicable
      creditsUsed: 0
    }
  }

  // Per-step pricing: fixed credit cost per step, ignoring token counts
  const fixedStepCost = getFixedStepCredits(metadata.model)
  const steps = metadata.steps || 1

  let creditsToDeduct: number
  if (fixedStepCost !== null) {
    creditsToDeduct = fixedStepCost * steps
    console.log(`[CreditManager] Per-step billing: ${fixedStepCost} credits x ${steps} steps = ${creditsToDeduct} credits (${metadata.model}, tier: ${getModelStepTier(metadata.model)})`)
  } else {
    // Token-based fallback with 4x markup
    creditsToDeduct = calculateCreditsFromTokens(
      usage.promptTokens,
      usage.completionTokens,
      metadata.model
    )
    console.log(`[CreditManager] Token-based billing: ${creditsToDeduct} credits from ${usage.promptTokens} input + ${usage.completionTokens} output tokens (${steps} steps)`)
  }

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
      skipRequestIncrement: metadata.skipRequestIncrement,
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
