import { createOpenAI } from '@ai-sdk/openai';
import { createMistral } from '@ai-sdk/mistral';
import { createXai } from '@ai-sdk/xai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createAnthropic } from '@ai-sdk/anthropic';

// Custom a0.dev provider implementation (no API key required)
function createA0Dev(options: { apiKey?: string } = {}) {
  // a0.dev doesn't require API key authentication
  return {
    languageModel(model: string) {
      return {
        specificationVersion: 'v1',
        provider: 'a0-dev',
        modelId: model,
        defaultObjectGenerationMode: 'json',

        async doGenerate(options: any) {
          const { prompt, mode, ...otherOptions } = options;

          // Convert AI SDK messages to a0.dev format
          const messages = prompt.map((msg: any) => ({
            role: msg.role,
            content: msg.content
          }));

          const body = {
            messages,
            temperature: otherOptions.temperature || 0.7,
            ...otherOptions
          };

          const response = await fetch('https://api.a0.dev/ai/llm', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
              // No Authorization header needed for a0.dev
            },
            body: JSON.stringify(body)
          });

          if (!response.ok) {
            const errorText = await response.text();
            // Log the actual error internally but don't expose it
            console.error(`a0.dev API error (${response.status}):`, errorText);
            throw new Error(`API_ERROR_${response.status}`);
          }

          const result = await response.json();

          return {
            text: result.completion || result.message || JSON.stringify(result),
            finishReason: 'stop',
            usage: {
              promptTokens: 0, // a0.dev doesn't provide token counts
              completionTokens: 0,
              totalTokens: 0
            },
            rawCall: {
              rawPrompt: prompt,
              rawSettings: otherOptions
            }
          };
        },

        async doStream(options: any) {
          const { prompt, ...otherOptions } = options;

          // Convert AI SDK messages to a0.dev format
          const messages = prompt.map((msg: any) => ({
            role: msg.role,
            content: msg.content
          }));

          const body = {
            messages,
            temperature: otherOptions.temperature || 0.7,
            stream: true,
            ...otherOptions
          };

          const response = await fetch('https://api.a0.dev/ai/llm', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
              // No Authorization header needed for a0.dev
            },
            body: JSON.stringify(body)
          });

          if (!response.ok) {
            const errorText = await response.text();
            // Log the actual error internally but don't expose it
            console.error(`a0.dev streaming API error (${response.status}):`, errorText);
            throw new Error(`API_ERROR_${response.status}`);
          }

          if (!response.body) {
            throw new Error('Response body is null - streaming not supported');
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();

          return {
            [Symbol.asyncIterator]() {
              return {
                async next() {
                  const { done, value } = await reader.read();
                  if (done) {
                    return { done: true, value: undefined };
                  }

                  const chunk = decoder.decode(value, { stream: true });
                  return {
                    done: false,
                    value: {
                      type: 'text-delta',
                      textDelta: chunk
                    }
                  };
                }
              };
            }
          };
        }
      };
    }
  };
}

// Create the a0.dev provider instance (no API key required)
const a0devProvider = createA0Dev();

// Create Vercel AI Gateway provider
const vercelGateway = createOpenAICompatible({
  name: 'vercel-gateway',
  baseURL: 'https://ai-gateway.vercel.sh/v1',
  apiKey: process.env.VERCEL_AI_GATEWAY_API_KEY || '',
});

// Create the default Codestral client
const codestral = createOpenAICompatible({
  name: 'codestral',
  baseURL: 'https://codestral.mistral.ai/v1',
  apiKey: process.env.CODESTRAL_API_KEY || 'DXfXAjwNIZcAv1ESKtoDwWZZF98lJxho',
});

// Create provider instances with fallback API keys
const openaiProvider = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

const mistralProvider = createMistral({
  apiKey: process.env.MISTRAL_API_KEY || 'W8txIqwcJnyHBTthSlouN2w3mQciqAUr',
});

// Create Mistral provider with Vercel AI Gateway (for vision support)
const mistralGatewayProvider = createMistral({
  baseURL: 'https://ai-gateway.vercel.sh/v1',
  apiKey: process.env.VERCEL_AI_GATEWAY_API_KEY || '',
});

const xaiProvider = createXai({
  apiKey: process.env.XAI_API_KEY || 'xai-your-api-key-here',
});

// Create Anthropic provider with Vercel AI Gateway
const anthropicProvider = createAnthropic({
  baseURL: 'https://ai-gateway.vercel.sh/v1',
  apiKey: process.env.VERCEL_AI_GATEWAY_API_KEY || '',
});

const openrouterProvider = createOpenAICompatible({
  name: 'openrouter',
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-v1-your-openrouter-api-key',
  headers: {
    'HTTP-Referer': 'https://pipilot.dev', // app's URL
    'X-Title': 'PiPilot', // app's display name
  },
});

// Create PiPilot Local Provider (OpenAI Compatible)
// In development, ALWAYS use localhost to ensure we're testing the local API
// In production, use the APP_URL or fallback to localhost
const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const pipilotBaseUrl = process.env.NODE_ENV === 'development'
  ? 'http://localhost:3000/api/v1'
  : `${appUrl}/api/v1`;

const pipilotProvider = createOpenAICompatible({
  name: 'pipilot',
  baseURL: pipilotBaseUrl,
  apiKey: 'not-needed', // Internal API doesn't require key
});

// Debug function to check environment variables
function checkProviderKeys() {
  const keys = {
    a0dev: process.env.A0_DEV_API_KEY || 'Not required',
    codestral: process.env.CODESTRAL_API_KEY || 'DXfXAjwNIZcAv1ESKtoDwWZZF98lJxho',
    vercelGateway: process.env.VERCEL_AI_GATEWAY_API_KEY || '',
    openai: process.env.OPENAI_API_KEY || '',
    mistral: process.env.MISTRAL_API_KEY || 'W8txIqwcJnyHBTthSlouN2w3mQciqAUr',
    xai: process.env.XAI_API_KEY || 'xai-your-api-key-here',
    openrouter: process.env.OPENROUTER_API_KEY || '',
  };

  if (process.env.NODE_ENV === 'development') {
    console.log('🔑 AI Provider API Keys Status:');
    console.log('================================');
    Object.entries(keys).forEach(([provider, key]) => {
      const envVarMap: Record<string, string> = {
        a0dev: 'A0_DEV_API_KEY',
        codestral: 'CODESTRAL_API_KEY',
        vercelGateway: 'VERCEL_AI_GATEWAY_API_KEY',
        openai: 'OPENAI_API_KEY',
        mistral: 'MISTRAL_API_KEY',
        xai: 'XAI_API_KEY',
        openrouter: 'OPENROUTER_API_KEY',
      };
      const isEnvVar = !!process.env[envVarMap[provider]];
      const status = isEnvVar ? '✅ Env' : '🔄 Fallback';
      const keyPreview = key ? `${key.substring(0, 12)}...` : 'Not found';
      console.log(`${provider.padEnd(12)}: ${status} (${keyPreview})`);
    });
    console.log('================================');
  }

  return keys;
}

// Check keys on initialization (only in development)
if (process.env.NODE_ENV === 'development') {
  checkProviderKeys();
}

// Model mapping with direct provider instances
const modelProviders: Record<string, any> = {
  // Auto/Default Option - uses direct xAI Grok Code Fast 1
  'auto': xaiProvider('grok-code-fast-1'),

  // Codestral Models (Custom - kept as is)
  'codestral-latest': codestral('codestral-latest'),

  // a0.dev Models (Custom - kept as is)
  'a0-dev-llm': a0devProvider.languageModel('a0-dev-llm'),

  // Mistral Models
  'pixtral-12b-2409': mistralProvider('pixtral-12b-2409'),

  // Vercel AI Gateway Models
  'mistral/devstral-2': vercelGateway('mistral/devstral-2'),
  'kwaipilot/kat-coder-pro-v1': vercelGateway('kwaipilot/kat-coder-pro-v1'),
  'xai/grok-code-fast-1': xaiProvider('grok-code-fast-1'), // Direct xAI provider
  'nvidia/nemotron-nano-12b-v2-vl': vercelGateway('nvidia/nemotron-nano-12b-v2-vl'),
  'minimax/minimax-m2': vercelGateway('minimax/minimax-m2'),
  'moonshotai/kimi-k2-thinking': vercelGateway('moonshotai/kimi-k2-thinking'),
  'mistral/devstral-small-2': vercelGateway('mistral/devstral-small-2'),
  'alibaba/qwen3-coder-plus': vercelGateway('alibaba/qwen3-coder-plus'),
  'meituan/longcat-flash-chat': vercelGateway('meituan/longcat-flash-chat'),

  // New Vercel AI Gateway Models
  'google/gemini-2.5-flash': vercelGateway('google/gemini-2.5-flash'),
  'google/gemini-2.5-pro': vercelGateway('google/gemini-2.5-pro'),
  'xai/glm-4.7': vercelGateway('xai/glm-4.7'),
  'zai/glm-4.7-flash': vercelGateway('zai/glm-4.7-flash'),
  'minimax/minimax-m2.1': vercelGateway('minimax/minimax-m2.1'),
  'alibaba/qwen3-max': vercelGateway('alibaba/qwen3-max'),
  'openai/gpt-5.1-thinking': vercelGateway('openai/gpt-5.1-thinking'),
  'openai/gpt-5.2-codex': vercelGateway('openai/gpt-5.2-codex'),
  'openai/o3': vercelGateway('openai/o3'),

  // Anthropic Models via Anthropic Provider (not OpenAI compatible)
  'anthropic/claude-haiku-4.5': anthropicProvider('anthropic/claude-haiku-4.5'),
  'anthropic/claude-sonnet-4.5': anthropicProvider('anthropic/claude-sonnet-4.5'),
  'anthropic/claude-opus-4.5': anthropicProvider('anthropic/claude-opus-4.5'),
};

// Models that support vision through Mistral provider (with correct Mistral API model names)
// When images are present, we use the Mistral provider instead of vercelGateway
const devstralVisionModels: Record<string, string> = {
  'mistral/devstral-2': 'devstral-2512',
  'mistral/devstral-small-2': 'labs-devstral-small-2512',
};

// =============================================================================
// PROVIDER FALLBACK SYSTEM
// =============================================================================
// When any model provider fails (Vercel gateway down, API errors, rate limits),
// we auto-switch to this direct-provider model that bypasses the gateway entirely.
export const FALLBACK_MODEL_ID = 'xai/grok-code-fast-1'

/**
 * Get the fallback model instance (direct xAI provider, bypasses Vercel gateway).
 * Used when the primary model provider fails with connection/API errors.
 */
export function getFallbackModel() {
  return xaiProvider('grok-code-fast-1')
}

/**
 * Check if an error is a provider-level failure that warrants a model fallback.
 * Returns true for: API 402/429/500/502/503/504, connection resets, DNS failures, timeouts.
 * Returns false for: client aborts, validation errors, auth errors (won't help to retry).
 *
 * Checks both error.message AND the AI SDK's statusCode property (AI_APICallError).
 */
export function isProviderError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const msg = error.message.toLowerCase()
  const name = error.name.toLowerCase()

  // Client-side aborts - not a provider issue
  if (name === 'aborterror' || msg.includes('aborted') || msg.includes('client aborted')) return false

  // Auth errors - fallback won't help if our API keys are bad
  // Note: 401/403 are OUR auth failures. 402 is gateway billing - fallback CAN fix that.
  if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized') || msg.includes('forbidden')) return false

  // Check AI SDK's statusCode property (AI_APICallError has this)
  const statusCode = (error as any).statusCode as number | undefined
  if (statusCode) {
    // 402 = Payment Required (Vercel gateway ran out of credits - bypass with direct provider)
    // 429 = Rate limited
    // 5xx = Server errors
    if (statusCode === 402 || statusCode === 429 || statusCode >= 500) return true
  }

  // Provider failures that a different model/provider can fix:
  return (
    // HTTP server errors from provider
    msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504') ||
    msg.includes('internal server error') || msg.includes('bad gateway') || msg.includes('service unavailable') ||
    // Rate limiting & billing
    msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests') ||
    msg.includes('402') || msg.includes('payment required') || msg.includes('insufficient funds') ||
    msg.includes('insufficient_funds') || msg.includes('top up') || msg.includes('credits') ||
    // Connection failures
    msg.includes('econnrefused') || msg.includes('econnreset') || msg.includes('enotfound') ||
    msg.includes('etimedout') || msg.includes('socket hang up') || msg.includes('socket close') ||
    msg.includes('fetch failed') || msg.includes('network') ||
    // Provider-specific
    msg.includes('overloaded') || msg.includes('capacity') || msg.includes('unavailable') ||
    msg.includes('gateway') || msg.includes('upstream')
  )
}

// Helper function to get a model by ID
export function getModel(modelId: string) {
  const model = modelProviders[modelId];
  if (!model) {
    throw new Error(`Model ${modelId} not found. Available models: ${Object.keys(modelProviders).join(', ')}`);
  }
  return model;
}

// Check if a model needs Mistral provider for vision
export function needsMistralVisionProvider(modelId: string): boolean {
  return !!devstralVisionModels[modelId];
}

// Get the vision-capable model for Devstral (uses Mistral Gateway provider with correct model name)
export function getDevstralVisionModel(modelId: string) {
  const mistralModelName = devstralVisionModels[modelId];
  if (!mistralModelName) {
    throw new Error(`Model ${modelId} is not a Devstral vision model`);
  }
  console.log(`[AI Providers] Using Mistral Gateway provider for ${modelId} -> ${mistralModelName} (vision support)`);
  return mistralGatewayProvider(mistralModelName);
}

// Export individual providers for direct use if needed
export {
  a0devProvider as a0dev,
  vercelGateway,
  openaiProvider as openai,
  mistralProvider as mistral,
  xaiProvider as xai,
  anthropicProvider as anthropic,
  openrouterProvider as openrouter,
  codestral,
  createOpenAICompatible,
};