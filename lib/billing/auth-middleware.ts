/**
 * ABE Auth Middleware - User ID-based authentication for chat-v2
 * Different from ai-api auth which uses API keys
 * This authenticates based on Supabase user session
 */

import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'
import { getWalletBalance, deductCredits, calculateCreditsFromTokens } from './credit-manager'

export interface UserAuthContext {
  userId: string
  email: string
  creditsBalance: number
  currentPlan: 'free' | 'creator' | 'collaborate' | 'scale'
  canPurchaseCredits: boolean
  isByok: boolean // True when user is using their own API keys (BYOK mode)
}

export interface AuthResult {
  success: boolean
  context?: UserAuthContext
  error?: {
    message: string
    code: 'UNAUTHORIZED' | 'INSUFFICIENT_CREDITS' | 'NO_WALLET' | 'INVALID_SESSION'
    statusCode: number
  }
}

/**
 * Authenticate user from Supabase session.
 * When isByok is true, credit checks are skipped (user pays their own provider).
 */
export async function authenticateUser(request: Request, isByok: boolean = false): Promise<AuthResult> {
  try {
    const supabase = await createClient()

    // Get user from session
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return {
        success: false,
        error: {
          message: 'Authentication required. Please sign in.',
          code: 'UNAUTHORIZED',
          statusCode: 401
        }
      }
    }

    // Get wallet balance
    const wallet = await getWalletBalance(user.id, supabase)

    if (!wallet) {
      return {
        success: false,
        error: {
          message: 'Wallet not found. Please contact support.',
          code: 'NO_WALLET',
          statusCode: 500
        }
      }
    }

    // BYOK mode: skip credit checks - user pays their own provider directly
    if (isByok) {
      console.log(`[AuthMiddleware] BYOK mode active for user ${user.id} - skipping credit check`)
      return {
        success: true,
        context: {
          userId: user.id,
          email: user.email || '',
          creditsBalance: wallet.creditsBalance,
          currentPlan: wallet.currentPlan,
          canPurchaseCredits: wallet.canPurchaseCredits,
          isByok: true
        }
      }
    }

    // Check if user has enough credits (minimum 1 credit required)
    if (wallet.creditsBalance < 1) {
      const message =
        wallet.currentPlan === 'free'
          ? 'Insufficient credits. Please upgrade to a paid plan to continue.'
          : 'Insufficient credits. Please purchase more credits to continue.'

      return {
        success: false,
        error: {
          message,
          code: 'INSUFFICIENT_CREDITS',
          statusCode: 402 // Payment Required
        }
      }
    }

    return {
      success: true,
      context: {
        userId: user.id,
        email: user.email || '',
        creditsBalance: wallet.creditsBalance,
        currentPlan: wallet.currentPlan,
        canPurchaseCredits: wallet.canPurchaseCredits,
        isByok: false
      }
    }
  } catch (error) {
    console.error('[AuthMiddleware] Exception in authenticateUser:', error)
    return {
      success: false,
      error: {
        message: 'Internal authentication error',
        code: 'INVALID_SESSION',
        statusCode: 500
      }
    }
  }
}

/**
 * Process request billing (deduct credits and log usage)
 * DEPRECATED: Use deductCreditsFromUsage directly for token-based billing
 * This is kept for backward compatibility
 */
export async function processRequestBilling(params: {
  userId: string
  model: string
  requestType?: string
  endpoint?: string
  responseTimeMs?: number
  tokensUsed?: number
  promptTokens?: number
  completionTokens?: number
  status?: 'success' | 'error' | 'timeout'
  errorMessage?: string
}): Promise<{
  success: boolean
  newBalance?: number
  creditsUsed?: number
  error?: string
}> {
  const {
    userId,
    model,
    requestType = 'chat',
    endpoint = '/api/chat-v2',
    responseTimeMs,
    tokensUsed,
    promptTokens,
    completionTokens,
    status = 'success',
    errorMessage
  } = params

  try {
    const supabase = await createClient()

    // Only deduct credits for successful requests
    if (status === 'success') {
      // Calculate credits based on token usage if available
      let creditsToDeduct = 1 // Minimum fallback
      
      if (promptTokens !== undefined && completionTokens !== undefined) {
        // Use token-based calculation
        creditsToDeduct = calculateCreditsFromTokens(promptTokens, completionTokens, model)
      } else if (tokensUsed) {
        // Estimate from total tokens (assume 50/50 split)
        const estimatedPrompt = Math.floor(tokensUsed / 2)
        const estimatedCompletion = tokensUsed - estimatedPrompt
        creditsToDeduct = calculateCreditsFromTokens(estimatedPrompt, estimatedCompletion, model)
      }
      
      const result = await deductCredits(
        userId,
        creditsToDeduct,
        {
          model,
          requestType,
          endpoint,
          responseTimeMs,
          tokensUsed,
          promptTokens,
          completionTokens,
          status,
          errorMessage
        },
        supabase
      )

      if (!result.success) {
        console.error('[AuthMiddleware] Failed to deduct credits:', result.error)
        return {
          success: false,
          error: result.error
        }
      }

      console.log(
        `[AuthMiddleware] ✅ Deducted ${result.creditsUsed} credits from user ${userId}. New balance: ${result.newBalance}`
      )

      return {
        success: true,
        newBalance: result.newBalance,
        creditsUsed: result.creditsUsed
      }
    } else {
      // For errors, just log without charging
      console.log(
        `[AuthMiddleware] ⚠️ Request failed (${status}): ${errorMessage || 'Unknown error'} - No credits charged`
      )
      return {
        success: true,
        newBalance: undefined,
        creditsUsed: 0
      }
    }
  } catch (error) {
    console.error('[AuthMiddleware] Exception in processRequestBilling:', error)
    return {
      success: false,
      error: 'Internal billing error'
    }
  }
}

/**
 * Get user credit info (for UI display)
 */
export async function getUserCreditInfo(userId: string): Promise<{
  creditsBalance: number
  creditsUsedThisMonth: number
  currentPlan: string
  canPurchaseCredits: boolean
  estimatedRemainingMessages: number
} | null> {
  try {
    const supabase = await createClient()
    const wallet = await getWalletBalance(userId, supabase)

    if (!wallet) {
      return null
    }

    return {
      creditsBalance: wallet.creditsBalance,
      creditsUsedThisMonth: wallet.creditsUsedThisMonth,
      currentPlan: wallet.currentPlan,
      canPurchaseCredits: wallet.canPurchaseCredits,
      estimatedRemainingMessages: Math.floor(wallet.creditsBalance / 20) // ~20 credits per message average (accounts for multi-step agent tasks)
    }
  } catch (error) {
    console.error('[AuthMiddleware] Exception in getUserCreditInfo:', error)
    return null
  }
}

/**
 * Validate user has sufficient credits before making request
 */
export async function validateCredits(userId: string): Promise<{
  valid: boolean
  message?: string
}> {
  try {
    const supabase = await createClient()
    const wallet = await getWalletBalance(userId, supabase)

    if (!wallet) {
      return {
        valid: false,
        message: 'Wallet not found'
      }
    }

    // Minimum 1 credit required (actual cost calculated after API call)
    if (wallet.creditsBalance < 1) {
      const message =
        wallet.currentPlan === 'free'
          ? `Insufficient credits (${wallet.creditsBalance} remaining). Upgrade to a paid plan to purchase more.`
          : `Insufficient credits (${wallet.creditsBalance} remaining). Purchase more credits to continue.`

      return {
        valid: false,
        message
      }
    }

    return {
      valid: true
    }
  } catch (error) {
    console.error('[AuthMiddleware] Exception in validateCredits:', error)
    return {
      valid: false,
      message: 'Internal validation error'
    }
  }
}
