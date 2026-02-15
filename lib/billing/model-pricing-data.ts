/**
 * Comprehensive Vercel AI Gateway Model Pricing Data
 * Source: Vercel AI Gateway pricing page (verified 2026-02-14)
 *
 * All prices are in USD per token (divide $/M by 1,000,000)
 * Cache prices are per token for cache read/write operations
 *
 * Used by credit-manager.ts to calculate accurate token-based billing.
 * When adding new models to PiPilot, add their pricing here first.
 */

export interface ModelPricingEntry {
  /** Display name for the model */
  name: string
  /** Provider (anthropic, google, openai, xai, mistral, etc.) */
  provider: string
  /** Context window size in tokens */
  contextWindow: number
  /** Maximum output tokens */
  maxOutput: number
  /** Cost per input token in USD */
  inputPerToken: number
  /** Cost per output token in USD */
  outputPerToken: number
  /** Cost per cached read token in USD (0 if not supported) */
  cacheReadPerToken: number
  /** Cost per cached write token in USD (0 if not supported) */
  cacheWritePerToken: number
  /** Web search cost per 1K searches in USD (0 if not supported) */
  webSearchPer1K: number
  /** Whether this model supports image input */
  supportsImageInput: boolean
  /** Whether this model generates images */
  generatesImages: boolean
  /** Image generation cost per image in USD (0 if not applicable) */
  imageGenCost: number
  /** Average latency in seconds */
  latencySeconds: number
  /** Average throughput in tokens per second */
  throughputTps: number
}

/**
 * Complete Vercel AI Gateway pricing data
 *
 * Prices are per-token (not per million). To get $/M, multiply by 1,000,000.
 * Example: input: 0.000003 = $3.00/M tokens
 */
export const VERCEL_MODEL_PRICING: Record<string, ModelPricingEntry> = {

  // =============================================================================
  // ANTHROPIC
  // =============================================================================

  'anthropic/claude-opus-4.6': {
    name: 'Claude Opus 4.6',
    provider: 'anthropic',
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    inputPerToken: 0.000005,       // $5/M
    outputPerToken: 0.000025,      // $25/M
    cacheReadPerToken: 0.0000005,  // $0.50/M
    cacheWritePerToken: 0.00000625, // $6.25/M
    webSearchPer1K: 10.00,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 1.8,
    throughputTps: 60,
  },

  'anthropic/claude-opus-4.5': {
    name: 'Claude Opus 4.5',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutput: 32_000,
    inputPerToken: 0.000015,       // $15/M
    outputPerToken: 0.000075,      // $75/M
    cacheReadPerToken: 0.0000015,  // $1.50/M
    cacheWritePerToken: 0.00001875, // $18.75/M
    webSearchPer1K: 10.00,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 1.1,
    throughputTps: 45,
  },

  'anthropic/claude-opus-4.1': {
    name: 'Claude Opus 4.1',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutput: 32_000,
    inputPerToken: 0.000015,       // $15/M
    outputPerToken: 0.000075,      // $75/M
    cacheReadPerToken: 0.0000015,  // $1.50/M
    cacheWritePerToken: 0.00001875, // $18.75/M
    webSearchPer1K: 10.00,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 1.1,
    throughputTps: 45,
  },

  'anthropic/claude-opus-4': {
    name: 'Claude Opus 4',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutput: 32_000,
    inputPerToken: 0.000015,       // $15/M
    outputPerToken: 0.000075,      // $75/M
    cacheReadPerToken: 0.0000015,  // $1.50/M
    cacheWritePerToken: 0.00001875, // $18.75/M
    webSearchPer1K: 10.00,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 1.3,
    throughputTps: 48,
  },

  'anthropic/claude-sonnet-4.5': {
    name: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    contextWindow: 1_000_000,
    maxOutput: 64_000,
    inputPerToken: 0.000003,       // $3/M
    outputPerToken: 0.000015,      // $15/M
    cacheReadPerToken: 0.0000003,  // $0.30/M
    cacheWritePerToken: 0.00000375, // $3.75/M
    webSearchPer1K: 10.00,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.7,
    throughputTps: 67,
  },

  'anthropic/claude-sonnet-4': {
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    contextWindow: 1_000_000,
    maxOutput: 64_000,
    inputPerToken: 0.000003,       // $3/M
    outputPerToken: 0.000015,      // $15/M
    cacheReadPerToken: 0.0000003,  // $0.30/M
    cacheWritePerToken: 0.00000375, // $3.75/M
    webSearchPer1K: 0,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.6,
    throughputTps: 56,
  },

  'anthropic/claude-3.7-sonnet': {
    name: 'Claude 3.7 Sonnet',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutput: 64_000,
    inputPerToken: 0.000003,       // $3/M
    outputPerToken: 0.000015,      // $15/M
    cacheReadPerToken: 0.0000003,  // $0.30/M
    cacheWritePerToken: 0.00000375, // $3.75/M
    webSearchPer1K: 0,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.5,
    throughputTps: 59,
  },

  'anthropic/claude-3.5-sonnet': {
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutput: 8_000,
    inputPerToken: 0.000003,       // $3/M
    outputPerToken: 0.000015,      // $15/M
    cacheReadPerToken: 0.0000003,  // $0.30/M
    cacheWritePerToken: 0.00000375, // $3.75/M
    webSearchPer1K: 0,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.6,
    throughputTps: 58,
  },

  'anthropic/claude-3.5-sonnet-20240620': {
    name: 'Claude 3.5 Sonnet (June 2024)',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutput: 8_000,
    inputPerToken: 0.000003,       // $3/M
    outputPerToken: 0.000015,      // $15/M
    cacheReadPerToken: 0.0000003,  // $0.30/M
    cacheWritePerToken: 0.00000375, // $3.75/M
    webSearchPer1K: 0,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.5,
    throughputTps: 83,
  },

  'anthropic/claude-haiku-4.5': {
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutput: 64_000,
    inputPerToken: 0.000001,       // $1/M
    outputPerToken: 0.000005,      // $5/M
    cacheReadPerToken: 0.0000001,  // $0.10/M
    cacheWritePerToken: 0.00000125, // $1.25/M
    webSearchPer1K: 10.00,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.4,
    throughputTps: 113,
  },

  'anthropic/claude-3.5-haiku': {
    name: 'Claude 3.5 Haiku',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutput: 4_000,
    inputPerToken: 0.00000080,     // $0.80/M
    outputPerToken: 0.000004,      // $4/M
    cacheReadPerToken: 0.00000008, // $0.08/M
    cacheWritePerToken: 0.000001,  // $1/M
    webSearchPer1K: 10.00,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.3,
    throughputTps: 148,
  },

  'anthropic/claude-3-haiku': {
    name: 'Claude 3 Haiku',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutput: 4_000,
    inputPerToken: 0.00000025,     // $0.25/M
    outputPerToken: 0.00000125,    // $1.25/M
    cacheReadPerToken: 0.00000003, // $0.03/M
    cacheWritePerToken: 0.0000003, // $0.30/M
    webSearchPer1K: 0,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.2,
    throughputTps: 141,
  },

  'anthropic/claude-3-opus': {
    name: 'Claude 3 Opus',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutput: 4_000,
    inputPerToken: 0.000015,       // $15/M
    outputPerToken: 0.000075,      // $75/M
    cacheReadPerToken: 0.0000015,  // $1.50/M
    cacheWritePerToken: 0.00001875, // $18.75/M
    webSearchPer1K: 0,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.8,
    throughputTps: 24,
  },

  // =============================================================================
  // OPENAI
  // =============================================================================

  'openai/gpt-5.2': {
    name: 'GPT-5.2',
    provider: 'openai',
    contextWindow: 400_000,
    maxOutput: 128_000,
    inputPerToken: 0.00000175,     // $1.75/M
    outputPerToken: 0.000014,      // $14/M
    cacheReadPerToken: 0.00000017, // $0.17/M
    cacheWritePerToken: 0,
    webSearchPer1K: 10.00,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.8,
    throughputTps: 59,
  },

  'openai/gpt-5.2-codex': {
    name: 'GPT-5.2 Codex',
    provider: 'openai',
    contextWindow: 400_000,
    maxOutput: 128_000,
    inputPerToken: 0.00000175,     // $1.75/M
    outputPerToken: 0.000014,      // $14/M
    cacheReadPerToken: 0.00000017, // $0.17/M
    cacheWritePerToken: 0,
    webSearchPer1K: 10.00,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 1.9,
    throughputTps: 326,
  },

  'openai/gpt-5.2-pro': {
    name: 'GPT-5.2 Pro',
    provider: 'openai',
    contextWindow: 400_000,
    maxOutput: 272_000,
    inputPerToken: 0.000015,       // $15/M
    outputPerToken: 0.000120,      // $120/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 10.00,
    supportsImageInput: true,
    generatesImages: true,
    imageGenCost: 0.120,  // $120/M output tokens for images
    latencySeconds: 14.8,
    throughputTps: 0,
  },

  'openai/gpt-5.2-chat': {
    name: 'GPT-5.2 Chat',
    provider: 'openai',
    contextWindow: 400_000,
    maxOutput: 128_000,
    inputPerToken: 0.00000125,     // $1.25/M
    outputPerToken: 0.000010,      // $10/M
    cacheReadPerToken: 0.00000013, // $0.13/M
    cacheWritePerToken: 0,
    webSearchPer1K: 10.00,
    supportsImageInput: true,
    generatesImages: true,
    imageGenCost: 0.01,
    latencySeconds: 0.6,
    throughputTps: 141,
  },

  'openai/gpt-5': {
    name: 'GPT-5',
    provider: 'openai',
    contextWindow: 400_000,
    maxOutput: 128_000,
    inputPerToken: 0.00000125,     // $1.25/M
    outputPerToken: 0.000010,      // $10/M
    cacheReadPerToken: 0.00000013, // $0.13/M
    cacheWritePerToken: 0,
    webSearchPer1K: 10.00,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.5,
    throughputTps: 48,
  },

  'openai/gpt-5-chat': {
    name: 'GPT-5 Chat',
    provider: 'openai',
    contextWindow: 128_000,
    maxOutput: 16_000,
    inputPerToken: 0.00000125,     // $1.25/M
    outputPerToken: 0.000010,      // $10/M
    cacheReadPerToken: 0.00000013, // $0.13/M
    cacheWritePerToken: 0,
    webSearchPer1K: 10.00,
    supportsImageInput: true,
    generatesImages: true,
    imageGenCost: 0.01,
    latencySeconds: 0.8,
    throughputTps: 72,
  },

  'openai/gpt-5-mini': {
    name: 'GPT-5 Mini',
    provider: 'openai',
    contextWindow: 400_000,
    maxOutput: 128_000,
    inputPerToken: 0.00000025,     // $0.25/M
    outputPerToken: 0.000002,      // $2/M
    cacheReadPerToken: 0.00000003, // $0.03/M
    cacheWritePerToken: 0,
    webSearchPer1K: 10.00,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 2.7,
    throughputTps: 244,
  },

  'openai/gpt-5-nano': {
    name: 'GPT-5 Nano',
    provider: 'openai',
    contextWindow: 400_000,
    maxOutput: 128_000,
    inputPerToken: 0.00000005,     // $0.05/M
    outputPerToken: 0.0000004,     // $0.40/M
    cacheReadPerToken: 0.00000001, // $0.01/M
    cacheWritePerToken: 0,
    webSearchPer1K: 10.00,
    supportsImageInput: true,
    generatesImages: true,
    imageGenCost: 0.0000004, // $0.40/M
    latencySeconds: 5.2,
    throughputTps: 610,
  },

  'openai/gpt-5-codex': {
    name: 'GPT-5 Codex',
    provider: 'openai',
    contextWindow: 400_000,
    maxOutput: 128_000,
    inputPerToken: 0.00000125,     // $1.25/M
    outputPerToken: 0.000010,      // $10/M
    cacheReadPerToken: 0.00000013, // $0.13/M
    cacheWritePerToken: 0,
    webSearchPer1K: 10.00,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.6,
    throughputTps: 68,
  },

  'openai/gpt-5-pro': {
    name: 'GPT-5 Pro',
    provider: 'openai',
    contextWindow: 200_000,
    maxOutput: 100_000,
    inputPerToken: 0.000010,       // $10/M
    outputPerToken: 0.000040,      // $40/M
    cacheReadPerToken: 0.0000025,  // $2.50/M
    cacheWritePerToken: 0,
    webSearchPer1K: 10.00,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0,
    throughputTps: 0,
  },

  'openai/gpt-5.1-thinking': {
    name: 'GPT-5.1 Thinking',
    provider: 'openai',
    contextWindow: 400_000,
    maxOutput: 128_000,
    inputPerToken: 0.00000125,     // $1.25/M
    outputPerToken: 0.000010,      // $10/M
    cacheReadPerToken: 0.00000013, // $0.13/M
    cacheWritePerToken: 0,
    webSearchPer1K: 10.00,
    supportsImageInput: true,
    generatesImages: true,
    imageGenCost: 0.01,
    latencySeconds: 4.8,
    throughputTps: 423,
  },

  'openai/gpt-5.1-instant': {
    name: 'GPT-5.1 Instant',
    provider: 'openai',
    contextWindow: 400_000,
    maxOutput: 128_000,
    inputPerToken: 0.00000125,     // $1.25/M
    outputPerToken: 0.000010,      // $10/M
    cacheReadPerToken: 0.00000013, // $0.13/M
    cacheWritePerToken: 0,
    webSearchPer1K: 10.00,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.6,
    throughputTps: 325,
  },

  'openai/gpt-5.1-codex': {
    name: 'GPT-5.1 Codex',
    provider: 'openai',
    contextWindow: 400_000,
    maxOutput: 128_000,
    inputPerToken: 0.00000125,     // $1.25/M
    outputPerToken: 0.000010,      // $10/M
    cacheReadPerToken: 0.00000013, // $0.13/M
    cacheWritePerToken: 0,
    webSearchPer1K: 10.00,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 2.5,
    throughputTps: 148,
  },

  'openai/gpt-5.1-codex-mini': {
    name: 'GPT-5.1 Codex Mini',
    provider: 'openai',
    contextWindow: 400_000,
    maxOutput: 128_000,
    inputPerToken: 0.00000025,     // $0.25/M
    outputPerToken: 0.000002,      // $2/M
    cacheReadPerToken: 0.00000003, // $0.03/M
    cacheWritePerToken: 0,
    webSearchPer1K: 10.00,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.6,
    throughputTps: 244,
  },

  'openai/gpt-5.1-codex-max': {
    name: 'GPT-5.1 Codex Max',
    provider: 'openai',
    contextWindow: 200_000,
    maxOutput: 100_000,
    inputPerToken: 0.000020,       // $20/M
    outputPerToken: 0.000080,      // $80/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 42.8,
    throughputTps: 0,
  },

  'openai/gpt-4.1': {
    name: 'GPT-4.1',
    provider: 'openai',
    contextWindow: 1_048_000,
    maxOutput: 33_000,
    inputPerToken: 0.000002,       // $2/M
    outputPerToken: 0.000008,      // $8/M
    cacheReadPerToken: 0.0000005,  // $0.50/M
    cacheWritePerToken: 0,
    webSearchPer1K: 10.00,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.8,
    throughputTps: 54,
  },

  'openai/gpt-4.1-mini': {
    name: 'GPT-4.1 Mini',
    provider: 'openai',
    contextWindow: 1_048_000,
    maxOutput: 33_000,
    inputPerToken: 0.0000004,      // $0.40/M
    outputPerToken: 0.0000016,     // $1.60/M
    cacheReadPerToken: 0.0000001,  // $0.10/M
    cacheWritePerToken: 0,
    webSearchPer1K: 10.00,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.7,
    throughputTps: 67,
  },

  'openai/gpt-4.1-nano': {
    name: 'GPT-4.1 Nano',
    provider: 'openai',
    contextWindow: 1_048_000,
    maxOutput: 33_000,
    inputPerToken: 0.0000001,      // $0.10/M
    outputPerToken: 0.0000004,     // $0.40/M
    cacheReadPerToken: 0.00000003, // $0.03/M
    cacheWritePerToken: 0,
    webSearchPer1K: 10.00,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.4,
    throughputTps: 309,
  },

  'openai/gpt-4o': {
    name: 'GPT-4o',
    provider: 'openai',
    contextWindow: 128_000,
    maxOutput: 16_000,
    inputPerToken: 0.0000025,      // $2.50/M
    outputPerToken: 0.000010,      // $10/M
    cacheReadPerToken: 0.00000125, // $1.25/M
    cacheWritePerToken: 0,
    webSearchPer1K: 10.00,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.5,
    throughputTps: 56,
  },

  'openai/gpt-4o-mini': {
    name: 'GPT-4o Mini',
    provider: 'openai',
    contextWindow: 128_000,
    maxOutput: 16_000,
    inputPerToken: 0.00000015,     // $0.15/M
    outputPerToken: 0.0000006,     // $0.60/M
    cacheReadPerToken: 0.00000007, // $0.07/M
    cacheWritePerToken: 0,
    webSearchPer1K: 10.00,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.5,
    throughputTps: 45,
  },

  'openai/o3': {
    name: 'O3',
    provider: 'openai',
    contextWindow: 200_000,
    maxOutput: 100_000,
    inputPerToken: 0.000002,       // $2/M
    outputPerToken: 0.000008,      // $8/M
    cacheReadPerToken: 0.0000005,  // $0.50/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 2.3,
    throughputTps: 43,
  },

  'openai/o3-mini': {
    name: 'O3 Mini',
    provider: 'openai',
    contextWindow: 200_000,
    maxOutput: 100_000,
    inputPerToken: 0.0000015,      // $1.50/M
    outputPerToken: 0.000006,      // $6/M
    cacheReadPerToken: 0.00000038, // $0.38/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 3.5,
    throughputTps: 100,
  },

  'openai/o3-pro': {
    name: 'O3 Pro',
    provider: 'openai',
    contextWindow: 200_000,
    maxOutput: 100_000,
    inputPerToken: 0.000015,       // $15/M
    outputPerToken: 0.000060,      // $60/M
    cacheReadPerToken: 0.0000075,  // $7.50/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 2.3,
    throughputTps: 43,
  },

  'openai/o4-mini': {
    name: 'O4 Mini',
    provider: 'openai',
    contextWindow: 200_000,
    maxOutput: 100_000,
    inputPerToken: 0.0000011,      // $1.10/M
    outputPerToken: 0.0000044,     // $4.40/M
    cacheReadPerToken: 0.00000028, // $0.28/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 2.1,
    throughputTps: 293,
  },

  'openai/gpt-3.5-turbo': {
    name: 'GPT-3.5 Turbo',
    provider: 'openai',
    contextWindow: 16_000,
    maxOutput: 4_000,
    inputPerToken: 0.0000005,      // $0.50/M
    outputPerToken: 0.0000015,     // $1.50/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.4,
    throughputTps: 0,
  },

  'openai/gpt-4-turbo': {
    name: 'GPT-4 Turbo',
    provider: 'openai',
    contextWindow: 128_000,
    maxOutput: 4_000,
    inputPerToken: 0.000010,       // $10/M
    outputPerToken: 0.000030,      // $30/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.9,
    throughputTps: 39,
  },

  'openai/o1': {
    name: 'O1',
    provider: 'openai',
    contextWindow: 128_000,
    maxOutput: 64_000,
    inputPerToken: 0.000003,       // $3/M
    outputPerToken: 0.000015,      // $15/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.3,
    throughputTps: 57,
  },

  'openai/gpt-oss-120b': {
    name: 'GPT OSS 120B',
    provider: 'openai',
    contextWindow: 131_000,
    maxOutput: 128_000,
    inputPerToken: 0.0000007,      // $0.07/M
    outputPerToken: 0.0000003,     // $0.30/M
    cacheReadPerToken: 0.00000004, // $0.04/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.1,
    throughputTps: 262,
  },

  'openai/gpt-oss-20b': {
    name: 'GPT OSS 20B',
    provider: 'openai',
    contextWindow: 131_000,
    maxOutput: 66_000,
    inputPerToken: 0.00000006,     // $0.06/M
    outputPerToken: 0.00000023,    // $0.23/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.3,
    throughputTps: 148,
  },

  // =============================================================================
  // GOOGLE
  // =============================================================================

  'google/gemini-3-flash': {
    name: 'Gemini 3 Flash',
    provider: 'google',
    contextWindow: 1_000_000,
    maxOutput: 65_000,
    inputPerToken: 0.0000005,      // $0.50/M
    outputPerToken: 0.000003,      // $3/M
    cacheReadPerToken: 0.00000005, // $0.05/M
    cacheWritePerToken: 0,
    webSearchPer1K: 14.00,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.8,
    throughputTps: 171,
  },

  'google/gemini-3-pro-preview': {
    name: 'Gemini 3 Pro Preview',
    provider: 'google',
    contextWindow: 1_000_000,
    maxOutput: 64_000,
    inputPerToken: 0.000002,       // $2/M
    outputPerToken: 0.000012,      // $12/M
    cacheReadPerToken: 0.0000002,  // $0.20/M
    cacheWritePerToken: 0,
    webSearchPer1K: 14.00,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 3.2,
    throughputTps: 133,
  },

  'google/gemini-3-pro-image': {
    name: 'Gemini 3 Pro Image',
    provider: 'google',
    contextWindow: 66_000,
    maxOutput: 33_000,
    inputPerToken: 0.000002,       // $2/M
    outputPerToken: 0.000120,      // $120/M (image generation)
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 14.00,
    supportsImageInput: true,
    generatesImages: true,
    imageGenCost: 0.120,
    latencySeconds: 11.5,
    throughputTps: 249,
  },

  'google/gemini-2.5-flash': {
    name: 'Gemini 2.5 Flash',
    provider: 'google',
    contextWindow: 1_049_000,
    maxOutput: 66_000,
    inputPerToken: 0.00000030,     // $0.30/M
    outputPerToken: 0.0000025,     // $2.50/M
    cacheReadPerToken: 0.00000003, // $0.03/M
    cacheWritePerToken: 0,
    webSearchPer1K: 35.00,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 1.9,
    throughputTps: 198,
  },

  'google/gemini-2.5-flash-lite': {
    name: 'Gemini 2.5 Flash Lite',
    provider: 'google',
    contextWindow: 1_049_000,
    maxOutput: 66_000,
    inputPerToken: 0.00000010,     // $0.10/M
    outputPerToken: 0.0000004,     // $0.40/M
    cacheReadPerToken: 0.00000001, // $0.01/M
    cacheWritePerToken: 0,
    webSearchPer1K: 35.00,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.3,
    throughputTps: 229,
  },

  'google/gemini-2.5-flash-image': {
    name: 'Gemini 2.5 Flash Image',
    provider: 'google',
    contextWindow: 33_000,
    maxOutput: 66_000,
    inputPerToken: 0.00000030,     // $0.30/M
    outputPerToken: 0.0000025,     // $2.50/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 35.00,
    supportsImageInput: true,
    generatesImages: true,
    imageGenCost: 0.04,
    latencySeconds: 0.5,
    throughputTps: 182,
  },

  'google/gemini-2.5-pro': {
    name: 'Gemini 2.5 Pro',
    provider: 'google',
    contextWindow: 1_049_000,
    maxOutput: 66_000,
    inputPerToken: 0.00000125,     // $1.25/M
    outputPerToken: 0.000010,      // $10/M
    cacheReadPerToken: 0.00000013, // $0.13/M
    cacheWritePerToken: 0,
    webSearchPer1K: 35.00,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.4,
    throughputTps: 309,
  },

  'google/gemini-2.0-flash': {
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    contextWindow: 1_049_000,
    maxOutput: 8_000,
    inputPerToken: 0.00000015,     // $0.15/M
    outputPerToken: 0.0000006,     // $0.60/M
    cacheReadPerToken: 0.00000003, // $0.03/M
    cacheWritePerToken: 0,
    webSearchPer1K: 35.00,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.3,
    throughputTps: 175,
  },

  'google/gemini-2.0-flash-lite': {
    name: 'Gemini 2.0 Flash Lite',
    provider: 'google',
    contextWindow: 1_049_000,
    maxOutput: 8_000,
    inputPerToken: 0.00000007,     // $0.07/M
    outputPerToken: 0.0000003,     // $0.30/M
    cacheReadPerToken: 0.00000004, // $0.04/M
    cacheWritePerToken: 0,
    webSearchPer1K: 35.00,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.1,
    throughputTps: 262,
  },

  // =============================================================================
  // XAI (Grok)
  // =============================================================================

  'xai/grok-code-fast-1': {
    name: 'Grok Code Fast 1',
    provider: 'xai',
    contextWindow: 256_000,
    maxOutput: 256_000,
    inputPerToken: 0.0000002,      // $0.20/M
    outputPerToken: 0.0000015,     // $1.50/M
    cacheReadPerToken: 0.00000002, // $0.02/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.3,
    throughputTps: 175,
  },

  'xai/grok-4': {
    name: 'Grok 4',
    provider: 'xai',
    contextWindow: 256_000,
    maxOutput: 256_000,
    inputPerToken: 0.000003,       // $3/M
    outputPerToken: 0.000015,      // $15/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 4.4,
    throughputTps: 69,
  },

  'xai/grok-4-fast-reasoning': {
    name: 'Grok 4 Fast Reasoning',
    provider: 'xai',
    contextWindow: 2_000_000,
    maxOutput: 256_000,
    inputPerToken: 0.0000002,      // $0.20/M
    outputPerToken: 0.0000005,     // $0.50/M
    cacheReadPerToken: 0.00000005, // $0.05/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 2.4,
    throughputTps: 176,
  },

  'xai/grok-4-fast-non-reasoning': {
    name: 'Grok 4 Fast Non-Reasoning',
    provider: 'xai',
    contextWindow: 2_000_000,
    maxOutput: 256_000,
    inputPerToken: 0.0000002,      // $0.20/M
    outputPerToken: 0.0000005,     // $0.50/M
    cacheReadPerToken: 0.00000005, // $0.05/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.7,
    throughputTps: 98,
  },

  'xai/grok-4.1-fast-reasoning': {
    name: 'Grok 4.1 Fast Reasoning',
    provider: 'xai',
    contextWindow: 2_000_000,
    maxOutput: 30_000,
    inputPerToken: 0.0000002,      // $0.20/M
    outputPerToken: 0.0000005,     // $0.50/M
    cacheReadPerToken: 0.00000005, // $0.05/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 3.5,
    throughputTps: 271,
  },

  'xai/grok-4.1-fast-non-reasoning': {
    name: 'Grok 4.1 Fast Non-Reasoning',
    provider: 'xai',
    contextWindow: 2_000_000,
    maxOutput: 30_000,
    inputPerToken: 0.0000002,      // $0.20/M
    outputPerToken: 0.0000005,     // $0.50/M
    cacheReadPerToken: 0.00000005, // $0.05/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.7,
    throughputTps: 144,
  },

  'xai/grok-3': {
    name: 'Grok 3',
    provider: 'xai',
    contextWindow: 131_000,
    maxOutput: 131_000,
    inputPerToken: 0.000003,       // $3/M
    outputPerToken: 0.000015,      // $15/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.7,
    throughputTps: 76,
  },

  'xai/grok-3-fast': {
    name: 'Grok 3 Fast',
    provider: 'xai',
    contextWindow: 131_000,
    maxOutput: 131_000,
    inputPerToken: 0.0000005,      // $0.50/M
    outputPerToken: 0.000002,      // $2/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.3,
    throughputTps: 84,
  },

  'xai/grok-3-mini': {
    name: 'Grok 3 Mini',
    provider: 'xai',
    contextWindow: 131_000,
    maxOutput: 131_000,
    inputPerToken: 0.0000006,      // $0.60/M
    outputPerToken: 0.000004,      // $4/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.3,
    throughputTps: 143,
  },

  'xai/grok-3-mini-fast': {
    name: 'Grok 3 Mini Fast',
    provider: 'xai',
    contextWindow: 131_000,
    maxOutput: 131_000,
    inputPerToken: 0.0000003,      // $0.30/M
    outputPerToken: 0.0000005,     // $0.50/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.3,
    throughputTps: 159,
  },

  'xai/grok-2-vision': {
    name: 'Grok 2 Vision',
    provider: 'xai',
    contextWindow: 33_000,
    maxOutput: 33_000,
    inputPerToken: 0.000002,       // $2/M
    outputPerToken: 0.000010,      // $10/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.6,
    throughputTps: 102,
  },

  // =============================================================================
  // DEEPSEEK
  // =============================================================================

  'deepseek/deepseek-v3.2': {
    name: 'DeepSeek V3.2',
    provider: 'deepseek',
    contextWindow: 164_000,
    maxOutput: 66_000,
    inputPerToken: 0.00000026,     // $0.26/M
    outputPerToken: 0.00000038,    // $0.38/M
    cacheReadPerToken: 0.00000013, // $0.13/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.9,
    throughputTps: 51,
  },

  'deepseek/deepseek-v3.2-thinking': {
    name: 'DeepSeek V3.2 Thinking',
    provider: 'deepseek',
    contextWindow: 128_000,
    maxOutput: 64_000,
    inputPerToken: 0.00000028,     // $0.28/M
    outputPerToken: 0.00000042,    // $0.42/M
    cacheReadPerToken: 0.00000003, // $0.03/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 1.5,
    throughputTps: 62,
  },

  'deepseek/deepseek-v3.1': {
    name: 'DeepSeek V3.1',
    provider: 'deepseek',
    contextWindow: 164_000,
    maxOutput: 16_000,
    inputPerToken: 0.00000135,     // $1.35/M
    outputPerToken: 0.0000054,     // $5.40/M
    cacheReadPerToken: 0.0000004,  // $0.40/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.4,
    throughputTps: 169,
  },

  'deepseek/deepseek-v3.1-terminus': {
    name: 'DeepSeek V3.1 Terminus',
    provider: 'deepseek',
    contextWindow: 128_000,
    maxOutput: 96_000,
    inputPerToken: 0.0000002,      // $0.20/M
    outputPerToken: 0.0000011,     // $1.10/M
    cacheReadPerToken: 0.00000003, // $0.03/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 2.0,
    throughputTps: 76,
  },

  'deepseek/deepseek-v3': {
    name: 'DeepSeek V3',
    provider: 'deepseek',
    contextWindow: 164_000,
    maxOutput: 164_000,
    inputPerToken: 0.00000050,     // $0.50/M
    outputPerToken: 0.0000015,     // $1.50/M
    cacheReadPerToken: 0.00000050, // $0.50/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.5,
    throughputTps: 126,
  },

  'deepseek/deepseek-r1': {
    name: 'DeepSeek R1',
    provider: 'deepseek',
    contextWindow: 164_000,
    maxOutput: 164_000,
    inputPerToken: 0.00000077,     // $0.77/M
    outputPerToken: 0.00000077,    // $0.77/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.5,
    throughputTps: 126,
  },

  // =============================================================================
  // MISTRAL
  // =============================================================================

  'mistral/devstral-2': {
    name: 'Devstral 2',
    provider: 'mistral',
    contextWindow: 256_000,
    maxOutput: 256_000,
    inputPerToken: 0,              // Free
    outputPerToken: 0,             // Free
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 3.9,
    throughputTps: 75,
  },

  'mistral/devstral-small-2': {
    name: 'Devstral Small 2',
    provider: 'mistral',
    contextWindow: 128_000,
    maxOutput: 100_000,
    inputPerToken: 0,              // Free
    outputPerToken: 0,             // Free
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 3.5,
    throughputTps: 100,
  },

  'mistral/devstral-small': {
    name: 'Devstral Small',
    provider: 'mistral',
    contextWindow: 128_000,
    maxOutput: 64_000,
    inputPerToken: 0.0000003,      // $0.30/M
    outputPerToken: 0.0000009,     // $0.90/M
    cacheReadPerToken: 0.00000005, // $0.05/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.3,
    throughputTps: 10,
  },

  'mistral/mistral-large-3': {
    name: 'Mistral Large 3',
    provider: 'mistral',
    contextWindow: 256_000,
    maxOutput: 256_000,
    inputPerToken: 0.0000005,      // $0.50/M
    outputPerToken: 0.0000015,     // $1.50/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.5,
    throughputTps: 59,
  },

  'mistral/mistral-medium': {
    name: 'Mistral Medium',
    provider: 'mistral',
    contextWindow: 128_000,
    maxOutput: 64_000,
    inputPerToken: 0.0000005,      // $0.50/M
    outputPerToken: 0.000002,      // $2/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.6,
    throughputTps: 44,
  },

  'mistral/mistral-small': {
    name: 'Mistral Small',
    provider: 'mistral',
    contextWindow: 128_000,
    maxOutput: 4_000,
    inputPerToken: 0.0000002,      // $0.20/M
    outputPerToken: 0.0000006,     // $0.60/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.2,
    throughputTps: 431,
  },

  'mistral/mistral-nemo': {
    name: 'Mistral Nemo',
    provider: 'mistral',
    contextWindow: 131_000,
    maxOutput: 131_000,
    inputPerToken: 0.00000015,     // $0.15/M
    outputPerToken: 0.00000015,    // $0.15/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.3,
    throughputTps: 84,
  },

  'mistral/codestral': {
    name: 'Codestral',
    provider: 'mistral',
    contextWindow: 256_000,
    maxOutput: 256_000,
    inputPerToken: 0.0000002,      // $0.20/M
    outputPerToken: 0.0000012,     // $1.20/M
    cacheReadPerToken: 0.00000011, // $0.11/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.7,
    throughputTps: 62,
  },

  'mistral/pixtral-large': {
    name: 'Pixtral Large',
    provider: 'mistral',
    contextWindow: 262_000,
    maxOutput: 262_000,
    inputPerToken: 0.00000115,     // $1.15/M
    outputPerToken: 0.000008,      // $8/M
    cacheReadPerToken: 0.00000015, // $0.15/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.7,
    throughputTps: 107,
  },

  'mistral/pixtral-12b': {
    name: 'Pixtral 12B',
    provider: 'mistral',
    contextWindow: 128_000,
    maxOutput: 4_000,
    inputPerToken: 0.00000010,     // $0.10/M
    outputPerToken: 0.00000010,    // $0.10/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.2,
    throughputTps: 123,
  },

  'mistral/magistral-small': {
    name: 'Magistral Small',
    provider: 'mistral',
    contextWindow: 128_000,
    maxOutput: 64_000,
    inputPerToken: 0.00000040,     // $0.40/M
    outputPerToken: 0.000002,      // $2/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.2,
    throughputTps: 126,
  },

  'mistral/magistral-medium': {
    name: 'Magistral Medium',
    provider: 'mistral',
    contextWindow: 200_000,
    maxOutput: 128_000,
    inputPerToken: 0.00000060,     // $0.60/M
    outputPerToken: 0.000004,      // $4/M
    cacheReadPerToken: 0.00000001, // $0.01/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 2.3,
    throughputTps: 59,
  },

  'mistral/ministral-3b': {
    name: 'Ministral 3B',
    provider: 'mistral',
    contextWindow: 128_000,
    maxOutput: 4_000,
    inputPerToken: 0.00000004,     // $0.04/M
    outputPerToken: 0.00000004,    // $0.04/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.2,
    throughputTps: 0,
  },

  'mistral/ministral-8b': {
    name: 'Ministral 8B',
    provider: 'mistral',
    contextWindow: 128_000,
    maxOutput: 4_000,
    inputPerToken: 0.00000010,     // $0.10/M
    outputPerToken: 0.00000010,    // $0.10/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.2,
    throughputTps: 90,
  },

  'mistral/ministral-14b': {
    name: 'Ministral 14B',
    provider: 'mistral',
    contextWindow: 131_000,
    maxOutput: 131_000,
    inputPerToken: 0.00000020,     // $0.20/M
    outputPerToken: 0.0000006,     // $0.60/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.3,
    throughputTps: 148,
  },

  // =============================================================================
  // MINIMAX
  // =============================================================================

  'minimax/minimax-m2.5': {
    name: 'MiniMax M2.5',
    provider: 'minimax',
    contextWindow: 205_000,
    maxOutput: 131_000,
    inputPerToken: 0.00000045,     // $0.45/M
    outputPerToken: 0.0000018,     // $1.80/M
    cacheReadPerToken: 0.00000011, // $0.11/M
    cacheWritePerToken: 0.00000038, // $0.38/M
    webSearchPer1K: 0,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.8,
    throughputTps: 207,
  },

  'minimax/minimax-m2.1': {
    name: 'MiniMax M2.1',
    provider: 'minimax',
    contextWindow: 205_000,
    maxOutput: 131_000,
    inputPerToken: 0.00000030,     // $0.30/M
    outputPerToken: 0.0000012,     // $1.20/M
    cacheReadPerToken: 0.00000003, // $0.03/M
    cacheWritePerToken: 0.00000038, // $0.38/M
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 3.1,
    throughputTps: 43,
  },

  'minimax/minimax-m2.1-lightning': {
    name: 'MiniMax M2.1 Lightning',
    provider: 'minimax',
    contextWindow: 205_000,
    maxOutput: 200_000,
    inputPerToken: 0.00000030,     // $0.30/M
    outputPerToken: 0.0000012,     // $1.20/M
    cacheReadPerToken: 0.00000003, // $0.03/M
    cacheWritePerToken: 0.00000038, // $0.38/M
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.5,
    throughputTps: 106,
  },

  'minimax/minimax-m2': {
    name: 'MiniMax M2',
    provider: 'minimax',
    contextWindow: 205_000,
    maxOutput: 205_000,
    inputPerToken: 0.00000030,     // $0.30/M
    outputPerToken: 0.0000024,     // $2.40/M
    cacheReadPerToken: 0.00000003, // $0.03/M
    cacheWritePerToken: 0.00000038, // $0.38/M
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 1.8,
    throughputTps: 38,
  },

  // =============================================================================
  // MOONSHOTAI (Kimi)
  // =============================================================================

  'moonshotai/kimi-k2.5': {
    name: 'Kimi K2.5',
    provider: 'moonshotai',
    contextWindow: 262_000,
    maxOutput: 262_000,
    inputPerToken: 0.0000005,      // $0.50/M
    outputPerToken: 0.0000028,     // $2.80/M
    cacheReadPerToken: 0.0000001,  // $0.10/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.8,
    throughputTps: 143,
  },

  'moonshotai/kimi-k2-thinking': {
    name: 'Kimi K2 Thinking',
    provider: 'moonshotai',
    contextWindow: 262_000,
    maxOutput: 262_000,
    inputPerToken: 0.00000060,     // $0.60/M
    outputPerToken: 0.0000025,     // $2.50/M
    cacheReadPerToken: 0.00000015, // $0.15/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 1.6,
    throughputTps: 33,
  },

  'moonshotai/kimi-k2-thinking-turbo': {
    name: 'Kimi K2 Thinking Turbo',
    provider: 'moonshotai',
    contextWindow: 262_000,
    maxOutput: 262_000,
    inputPerToken: 0.00000030,     // $0.30/M
    outputPerToken: 0.0000029,     // $2.90/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.8,
    throughputTps: 61,
  },

  'moonshotai/kimi-k2': {
    name: 'Kimi K2',
    provider: 'moonshotai',
    contextWindow: 131_000,
    maxOutput: 131_000,
    inputPerToken: 0.00000015,     // $0.15/M
    outputPerToken: 0.0000015,     // $1.50/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.4,
    throughputTps: 88,
  },

  'moonshotai/kimi-k2-turbo': {
    name: 'Kimi K2 Turbo',
    provider: 'moonshotai',
    contextWindow: 131_000,
    maxOutput: 41_000,
    inputPerToken: 0.00000040,     // $0.40/M
    outputPerToken: 0.0000008,     // $0.80/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.3,
    throughputTps: 3320,
  },

  'moonshotai/kimi-k2-0905': {
    name: 'Kimi K2 0905',
    provider: 'moonshotai',
    contextWindow: 256_000,
    maxOutput: 16_000,
    inputPerToken: 0.0000024,      // $2.40/M
    outputPerToken: 0.000010,      // $10/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.8,
    throughputTps: 0,
  },

  // =============================================================================
  // ALIBABA (Qwen)
  // =============================================================================

  'alibaba/qwen3-max-thinking': {
    name: 'Qwen 3 Max Thinking',
    provider: 'alibaba',
    contextWindow: 262_000,
    maxOutput: 66_000,
    inputPerToken: 0.0000012,      // $1.20/M
    outputPerToken: 0.000006,      // $6/M
    cacheReadPerToken: 0.00000024, // $0.24/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 1.6,
    throughputTps: 33,
  },

  'alibaba/qwen3-max': {
    name: 'Qwen 3 Max',
    provider: 'alibaba',
    contextWindow: 262_000,
    maxOutput: 67_000,
    inputPerToken: 0.0000004,      // $0.40/M
    outputPerToken: 0.0000016,     // $1.60/M
    cacheReadPerToken: 0.0000003,  // $0.30/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.5,
    throughputTps: 105,
  },

  'alibaba/qwen3-coder': {
    name: 'Qwen 3 Coder',
    provider: 'alibaba',
    contextWindow: 262_000,
    maxOutput: 33_000,
    inputPerToken: 0.00000015,     // $0.15/M
    outputPerToken: 0.0000006,     // $0.60/M
    cacheReadPerToken: 0.00000002, // $0.02/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.7,
    throughputTps: 160,
  },

  'alibaba/qwen3-coder-plus': {
    name: 'Qwen 3 Coder Plus',
    provider: 'alibaba',
    contextWindow: 1_000_000,
    maxOutput: 66_000,
    inputPerToken: 0.00000100,     // $1/M
    outputPerToken: 0.000005,      // $5/M
    cacheReadPerToken: 0.0000002,  // $0.20/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 1.6,
    throughputTps: 51,
  },

  'alibaba/qwen3-vl-thinking': {
    name: 'Qwen3 VL Thinking',
    provider: 'alibaba',
    contextWindow: 262_000,
    maxOutput: 66_000,
    inputPerToken: 0.00000013,     // $0.13/M
    outputPerToken: 0.00000052,    // $0.52/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 2.0,
    throughputTps: 45,
  },

  'alibaba/qwen-3-235b': {
    name: 'Qwen 3 235B',
    provider: 'alibaba',
    contextWindow: 262_000,
    maxOutput: 262_000,
    inputPerToken: 0.00000060,     // $0.60/M
    outputPerToken: 0.0000025,     // $2.50/M
    cacheReadPerToken: 0.00000015, // $0.15/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.7,
    throughputTps: 107,
  },

  'alibaba/qwen-3-32b': {
    name: 'Qwen 3 32B',
    provider: 'alibaba',
    contextWindow: 131_000,
    maxOutput: 41_000,
    inputPerToken: 0.00000009,     // $0.09/M
    outputPerToken: 0.0000011,     // $1.10/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.4,
    throughputTps: 299,
  },

  'alibaba/qwen-3-30b': {
    name: 'Qwen 3 30B',
    provider: 'alibaba',
    contextWindow: 131_000,
    maxOutput: 66_000,
    inputPerToken: 0.00000015,     // $0.15/M
    outputPerToken: 0.0000015,     // $1.50/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 1.0,
    throughputTps: 280,
  },

  'alibaba/qwen-3-14b': {
    name: 'Qwen 3 14B',
    provider: 'alibaba',
    contextWindow: 131_000,
    maxOutput: 131_000,
    inputPerToken: 0.00000004,     // $0.04/M
    outputPerToken: 0.00000015,    // $0.15/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.5,
    throughputTps: 221,
  },

  // =============================================================================
  // ZAI (GLM)
  // =============================================================================

  'zai/glm-5': {
    name: 'GLM 5',
    provider: 'zai',
    contextWindow: 203_000,
    maxOutput: 131_000,
    inputPerToken: 0.000001,       // $1/M
    outputPerToken: 0.0000032,     // $3.20/M
    cacheReadPerToken: 0.0000002,  // $0.20/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 51.2,
    throughputTps: 43,
  },

  'zai/glm-4.7': {
    name: 'GLM 4.7',
    provider: 'zai',
    contextWindow: 131_000,
    maxOutput: 131_000,
    inputPerToken: 0.00000025,     // $0.25/M
    outputPerToken: 0.00000069,    // $0.69/M
    cacheReadPerToken: 0.00000025, // $0.25/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.2,
    throughputTps: 1894,
  },

  'zai/glm-4.7-flash': {
    name: 'GLM 4.7 Flash',
    provider: 'zai',
    contextWindow: 128_000,
    maxOutput: 24_000,
    inputPerToken: 0.00000030,     // $0.30/M
    outputPerToken: 0.0000009,     // $0.90/M
    cacheReadPerToken: 0.00000005, // $0.05/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 2.0,
    throughputTps: 119,
  },

  'zai/glm-4.6': {
    name: 'GLM 4.6',
    provider: 'zai',
    contextWindow: 200_000,
    maxOutput: 131_000,
    inputPerToken: 0.00000022,     // $0.22/M
    outputPerToken: 0.00000088,    // $0.88/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.5,
    throughputTps: 115,
  },

  'zai/glm-4.5': {
    name: 'GLM 4.5',
    provider: 'zai',
    contextWindow: 128_000,
    maxOutput: 8_000,
    inputPerToken: 0.00000016,     // $0.16/M
    outputPerToken: 0.00000016,    // $0.16/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.2,
    throughputTps: 181,
  },

  'zai/glm-4.5-air': {
    name: 'GLM 4.5 Air',
    provider: 'zai',
    contextWindow: 131_000,
    maxOutput: 33_000,
    inputPerToken: 0.00000007,     // $0.07/M
    outputPerToken: 0.00000046,    // $0.46/M
    cacheReadPerToken: 0.00000011, // $0.11/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 1.0,
    throughputTps: 15,
  },

  // =============================================================================
  // PERPLEXITY (Web Search)
  // =============================================================================

  'perplexity/sonar': {
    name: 'Sonar',
    provider: 'perplexity',
    contextWindow: 127_000,
    maxOutput: 8_000,
    inputPerToken: 0.000001,       // $1/M
    outputPerToken: 0.000005,      // $5/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 1.5,
    throughputTps: 138,
  },

  'perplexity/sonar-pro': {
    name: 'Sonar Pro',
    provider: 'perplexity',
    contextWindow: 200_000,
    maxOutput: 8_000,
    inputPerToken: 0.000003,       // $3/M
    outputPerToken: 0.000015,      // $15/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 1.3,
    throughputTps: 128,
  },

  'perplexity/sonar-reasoning': {
    name: 'Sonar Reasoning',
    provider: 'perplexity',
    contextWindow: 127_000,
    maxOutput: 8_000,
    inputPerToken: 0.000001,       // $1/M
    outputPerToken: 0.000005,      // $5/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 1.5,
    throughputTps: 108,
  },

  'perplexity/sonar-reasoning-pro': {
    name: 'Sonar Reasoning Pro',
    provider: 'perplexity',
    contextWindow: 200_000,
    maxOutput: 8_000,
    inputPerToken: 0.000002,       // $2/M
    outputPerToken: 0.000008,      // $8/M
    cacheReadPerToken: 0.0000005,  // $0.50/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 1.1,
    throughputTps: 48,
  },

  // =============================================================================
  // META (Llama) - Open source, but Vercel charges for hosting
  // =============================================================================

  'meta/llama-4-scout': {
    name: 'Llama 4 Scout',
    provider: 'meta',
    contextWindow: 524_000,
    maxOutput: 8_000,
    inputPerToken: 0.00000024,     // $0.24/M
    outputPerToken: 0.00000097,    // $0.97/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.3,
    throughputTps: 196,
  },

  'meta/llama-4-maverick': {
    name: 'Llama 4 Maverick',
    provider: 'meta',
    contextWindow: 1_000_000,
    maxOutput: 1_000_000,
    inputPerToken: 0.00000030,     // $0.30/M
    outputPerToken: 0.0000025,     // $2.50/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.4,
    throughputTps: 177,
  },

  'meta/llama-3.3-70b': {
    name: 'Llama 3.3 70B',
    provider: 'meta',
    contextWindow: 131_000,
    maxOutput: 131_000,
    inputPerToken: 0.00000010,     // $0.10/M
    outputPerToken: 0.00000010,    // $0.10/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.1,
    throughputTps: 234,
  },

  'meta/llama-3.1-8b': {
    name: 'Llama 3.1 8B',
    provider: 'meta',
    contextWindow: 131_000,
    maxOutput: 8_000,
    inputPerToken: 0.00000017,     // $0.17/M
    outputPerToken: 0.00000066,    // $0.66/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.2,
    throughputTps: 431,
  },

  'meta/llama-3.1-70b': {
    name: 'Llama 3.1 70B',
    provider: 'meta',
    contextWindow: 131_000,
    maxOutput: 16_000,
    inputPerToken: 0.00000072,     // $0.72/M
    outputPerToken: 0.00000072,    // $0.72/M
    cacheReadPerToken: 0.00000085, // $0.85/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.3,
    throughputTps: 32,
  },

  // =============================================================================
  // KWAIPILOT
  // =============================================================================

  'kwaipilot/kat-coder-pro-v1': {
    name: 'KAT Coder Pro V1',
    provider: 'kwaipilot',
    contextWindow: 256_000,
    maxOutput: 32_000,
    inputPerToken: 0.00000003,     // $0.03/M
    outputPerToken: 0.0000012,     // $1.20/M
    cacheReadPerToken: 0.00000006, // $0.06/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 2.1,
    throughputTps: 84,
  },

  // =============================================================================
  // COHERE
  // =============================================================================

  'cohere/command-a': {
    name: 'Command A',
    provider: 'cohere',
    contextWindow: 256_000,
    maxOutput: 8_000,
    inputPerToken: 0.0000025,      // $2.50/M
    outputPerToken: 0.000010,      // $10/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.2,
    throughputTps: 63,
  },

  // =============================================================================
  // AMAZON (Nova)
  // =============================================================================

  'amazon/nova-micro': {
    name: 'Nova Micro',
    provider: 'amazon',
    contextWindow: 128_000,
    maxOutput: 8_000,
    inputPerToken: 0.00000004,     // $0.04/M
    outputPerToken: 0.00000014,    // $0.14/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.3,
    throughputTps: 0,
  },

  'amazon/nova-lite': {
    name: 'Nova Lite',
    provider: 'amazon',
    contextWindow: 300_000,
    maxOutput: 8_000,
    inputPerToken: 0.00000006,     // $0.06/M
    outputPerToken: 0.00000024,    // $0.24/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.4,
    throughputTps: 100,
  },

  'amazon/nova-pro': {
    name: 'Nova Pro',
    provider: 'amazon',
    contextWindow: 300_000,
    maxOutput: 8_000,
    inputPerToken: 0.0000008,      // $0.80/M
    outputPerToken: 0.0000032,     // $3.20/M
    cacheReadPerToken: 0,
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: true,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.4,
    throughputTps: 170,
  },

  // =============================================================================
  // BYTEDANCE (Seed)
  // =============================================================================

  'bytedance/seed-1.8': {
    name: 'Seed 1.8',
    provider: 'bytedance',
    contextWindow: 256_000,
    maxOutput: 64_000,
    inputPerToken: 0.00000025,     // $0.25/M
    outputPerToken: 0.000002,      // $2/M
    cacheReadPerToken: 0.00000005, // $0.05/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 1.2,
    throughputTps: 77,
  },

  'bytedance/seed-1.6': {
    name: 'Seed 1.6',
    provider: 'bytedance',
    contextWindow: 66_000,
    maxOutput: 16_000,
    inputPerToken: 0.0000006,      // $0.60/M
    outputPerToken: 0.0000018,     // $1.80/M
    cacheReadPerToken: 0.00000011, // $0.11/M
    cacheWritePerToken: 0,
    webSearchPer1K: 0,
    supportsImageInput: false,
    generatesImages: false,
    imageGenCost: 0,
    latencySeconds: 0.7,
    throughputTps: 80,
  },
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get pricing for a model by its ID, with fuzzy matching for aliases.
 * Falls back to a safe default (Claude Sonnet 4.5 pricing) if model not found.
 */
export function getVercelModelPricing(modelId: string): { input: number; output: number; cacheRead: number; cacheWrite: number } {
  // Direct lookup
  const entry = VERCEL_MODEL_PRICING[modelId]
  if (entry) {
    return {
      input: entry.inputPerToken,
      output: entry.outputPerToken,
      cacheRead: entry.cacheReadPerToken,
      cacheWrite: entry.cacheWritePerToken,
    }
  }

  // Try without provider prefix (e.g. "claude-sonnet-4.5" -> "anthropic/claude-sonnet-4.5")
  for (const [key, value] of Object.entries(VERCEL_MODEL_PRICING)) {
    if (key.endsWith('/' + modelId) || key.split('/')[1] === modelId) {
      return {
        input: value.inputPerToken,
        output: value.outputPerToken,
        cacheRead: value.cacheReadPerToken,
        cacheWrite: value.cacheWritePerToken,
      }
    }
  }

  // Fallback: Claude Sonnet 4.5 pricing (safe, not cheapest)
  console.warn(`[ModelPricing] Unknown model "${modelId}" - using Claude Sonnet 4.5 pricing as fallback`)
  return {
    input: 0.000003,    // $3/M
    output: 0.000015,   // $15/M
    cacheRead: 0.0000003,
    cacheWrite: 0.00000375,
  }
}

/**
 * Get the full model entry including metadata (context window, latency, etc.)
 */
export function getModelEntry(modelId: string): ModelPricingEntry | null {
  return VERCEL_MODEL_PRICING[modelId] || null
}

/**
 * List all available models for a given provider
 */
export function getModelsByProvider(provider: string): Array<{ id: string; entry: ModelPricingEntry }> {
  return Object.entries(VERCEL_MODEL_PRICING)
    .filter(([_, entry]) => entry.provider === provider)
    .map(([id, entry]) => ({ id, entry }))
}

/**
 * Get all unique providers
 */
export function getProviders(): string[] {
  return [...new Set(Object.values(VERCEL_MODEL_PRICING).map(e => e.provider))]
}

/**
 * Check if a model has free pricing (e.g. Devstral 2)
 */
export function isFreeTierModel(modelId: string): boolean {
  const entry = VERCEL_MODEL_PRICING[modelId]
  if (!entry) return false
  return entry.inputPerToken === 0 && entry.outputPerToken === 0
}
