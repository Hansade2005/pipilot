import { createOpenAI } from '@ai-sdk/openai';
import { createMistral } from '@ai-sdk/mistral';
import { createXai } from '@ai-sdk/xai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createAnthropic } from '@ai-sdk/anthropic';

// =============================================================================
// PROVIDER FACTORIES (lazy - created on first use to avoid webpack TDZ issues)
// =============================================================================
// Providers are created once and cached. This avoids eager module-scope
// initialization which causes 'Cannot access X before initialization' errors
// when webpack's module concatenation reorders const declarations across
// multiple @ai-sdk packages.

let _a0devProvider: ReturnType<typeof createA0Dev> | null = null;
let _vercelGateway: ReturnType<typeof createOpenAICompatible> | null = null;
let _codestral: ReturnType<typeof createOpenAICompatible> | null = null;
let _openaiProvider: ReturnType<typeof createOpenAI> | null = null;
let _mistralProvider: ReturnType<typeof createMistral> | null = null;
let _mistralGatewayProvider: ReturnType<typeof createMistral> | null = null;
let _xaiProvider: ReturnType<typeof createXai> | null = null;
let _anthropicProvider: ReturnType<typeof createAnthropic> | null = null;
let _openrouterProvider: ReturnType<typeof createOpenAICompatible> | null = null;

function getA0DevProvider() {
  if (!_a0devProvider) _a0devProvider = createA0Dev();
  return _a0devProvider;
}

function getVercelGateway() {
  if (!_vercelGateway) {
    _vercelGateway = createOpenAICompatible({
      name: 'vercel-gateway',
      baseURL: 'https://ai-gateway.vercel.sh/v1',
      apiKey: process.env.VERCEL_AI_GATEWAY_API_KEY || '',
    });
  }
  return _vercelGateway;
}

function getCodestral() {
  if (!_codestral) {
    _codestral = createOpenAICompatible({
      name: 'codestral',
      baseURL: 'https://codestral.mistral.ai/v1',
      apiKey: process.env.CODESTRAL_API_KEY || 'DXfXAjwNIZcAv1ESKtoDwWZZF98lJxho',
    });
  }
  return _codestral;
}

function getOpenAIProvider() {
  if (!_openaiProvider) {
    _openaiProvider = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    });
  }
  return _openaiProvider;
}

function getMistralProvider() {
  if (!_mistralProvider) {
    _mistralProvider = createMistral({
      apiKey: process.env.MISTRAL_API_KEY || 'W8txIqwcJnyHBTthSlouN2w3mQciqAUr',
    });
  }
  return _mistralProvider;
}

function getMistralGatewayProvider() {
  if (!_mistralGatewayProvider) {
    _mistralGatewayProvider = createMistral({
      baseURL: 'https://ai-gateway.vercel.sh/v1',
      apiKey: process.env.VERCEL_AI_GATEWAY_API_KEY || '',
    });
  }
  return _mistralGatewayProvider;
}

function getXaiProvider() {
  if (!_xaiProvider) {
    _xaiProvider = createXai({
      apiKey: process.env.XAI_API_KEY || 'xai-your-api-key-here',
    });
  }
  return _xaiProvider;
}

function getAnthropicProvider() {
  if (!_anthropicProvider) {
    _anthropicProvider = createAnthropic({
      baseURL: 'https://ai-gateway.vercel.sh/v1',
      apiKey: process.env.VERCEL_AI_GATEWAY_API_KEY || '',
    });
  }
  return _anthropicProvider;
}

function getOpenRouterProvider() {
  if (!_openrouterProvider) {
    _openrouterProvider = createOpenAICompatible({
      name: 'openrouter',
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-v1-your-openrouter-api-key',
      headers: {
        'HTTP-Referer': 'https://pipilot.dev',
        'X-Title': 'PiPilot',
      },
    });
  }
  return _openrouterProvider;
}

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
            },
            body: JSON.stringify(body)
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`a0.dev API error (${response.status}):`, errorText);
            throw new Error(`API_ERROR_${response.status}`);
          }

          const result = await response.json();

          return {
            text: result.completion || result.message || JSON.stringify(result),
            finishReason: 'stop',
            usage: {
              promptTokens: 0,
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
            },
            body: JSON.stringify(body)
          });

          if (!response.ok) {
            const errorText = await response.text();
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

// =============================================================================
// MODEL FACTORY (lazy creation with caching)
// =============================================================================
// Models are created on first request and cached. This prevents webpack from
// eagerly evaluating all provider code at module scope, which caused TDZ errors
// when module concatenation reordered const declarations across @ai-sdk packages.

const modelCache = new Map<string, any>();

function createModelInstance(modelId: string): any {
  switch (modelId) {
    // Auto/Default - direct xAI provider
    case 'auto':
      return getXaiProvider()('grok-code-fast-1');

    // Codestral
    case 'codestral-latest':
      return getCodestral()('codestral-latest');

    // a0.dev
    case 'a0-dev-llm':
      return getA0DevProvider().languageModel('a0-dev-llm');

    // Mistral direct
    case 'pixtral-12b-2409':
      return getMistralProvider()('pixtral-12b-2409');

    // xAI direct (NOT gateway)
    case 'xai/grok-code-fast-1':
      return getXaiProvider()('grok-code-fast-1');

    // Anthropic via Vercel AI Gateway
    case 'anthropic/claude-haiku-4.5':
      return getAnthropicProvider()('anthropic/claude-haiku-4.5');
    case 'anthropic/claude-sonnet-4.5':
      return getAnthropicProvider()('anthropic/claude-sonnet-4.5');
    case 'anthropic/claude-opus-4.5':
      return getAnthropicProvider()('anthropic/claude-opus-4.5');

    // All other models go through Vercel AI Gateway
    default: {
      // Vercel gateway models use the provider/model format
      const gateway = getVercelGateway();
      return gateway(modelId);
    }
  }
}

// Models that support vision through Mistral provider (with correct Mistral API model names)
const devstralVisionModels: Record<string, string> = {
  'mistral/devstral-2': 'devstral-2512',
  'mistral/devstral-small-2': 'labs-devstral-small-2512',
};

// =============================================================================
// PROVIDER FALLBACK SYSTEM
// =============================================================================
export const FALLBACK_MODEL_ID = 'xai/grok-code-fast-1'

/**
 * Get the fallback model instance (direct xAI provider, bypasses Vercel gateway).
 */
export function getFallbackModel() {
  return getXaiProvider()('grok-code-fast-1')
}

/**
 * Check if an error is a provider-level failure that warrants a model fallback.
 */
export function isProviderError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const msg = error.message.toLowerCase()
  const name = error.name.toLowerCase()

  if (name === 'aborterror' || msg.includes('aborted') || msg.includes('client aborted')) return false
  if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized') || msg.includes('forbidden')) return false

  const statusCode = (error as any).statusCode as number | undefined
  if (statusCode) {
    if (statusCode === 402 || statusCode === 429 || statusCode >= 500) return true
  }

  return (
    msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504') ||
    msg.includes('internal server error') || msg.includes('bad gateway') || msg.includes('service unavailable') ||
    msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests') ||
    msg.includes('402') || msg.includes('payment required') || msg.includes('insufficient funds') ||
    msg.includes('insufficient_funds') || msg.includes('top up') || msg.includes('credits') ||
    msg.includes('econnrefused') || msg.includes('econnreset') || msg.includes('enotfound') ||
    msg.includes('etimedout') || msg.includes('socket hang up') || msg.includes('socket close') ||
    msg.includes('fetch failed') || msg.includes('network') ||
    msg.includes('overloaded') || msg.includes('capacity') || msg.includes('unavailable') ||
    msg.includes('gateway') || msg.includes('upstream')
  )
}

// Helper function to get a model by ID (lazy creation with caching)
export function getModel(modelId: string) {
  let model = modelCache.get(modelId);
  if (!model) {
    model = createModelInstance(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }
    modelCache.set(modelId, model);
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
  return getMistralGatewayProvider()(mistralModelName);
}

// Export the vercelGateway getter for describe-image route
export { getVercelGateway as vercelGateway };
