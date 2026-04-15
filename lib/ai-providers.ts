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
let _kiloGateway: ReturnType<typeof createOpenAICompatible> | null = null;
// Ollama API key rotation: DB-backed smart rotation (see getNextOllamaKeyFromDB)
let _ollamaKeyIndex = 0; // fallback for env-based rotation
// Bonsai API key rotation: supports comma-separated keys in BONSAI_API_KEY
let _bonsaiKeyIndex = 0;
// Kilo API key rotation: supports comma-separated keys in KILO_API_KEY
let _kiloKeyIndex = 0;

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

function getKiloGateway() {
  // Always create fresh to pick the next rotated key.
  return createOpenAICompatible({
    name: 'kilo-gateway',
    baseURL: 'https://api.kilo.ai/api/gateway',
    apiKey: getNextKiloKey(),
  });
}

function getOllamaCloudProvider() {
  // Fallback: env-based rotation (used when DB is unavailable)
  // Using createOpenAI for parallel tool call support
  return createOpenAI({
    name: 'ollama-cloud',
    baseURL: 'https://ollama.com/v1',
    apiKey: getNextOllamaKey(),
  });
}

/**
 * DB-backed Ollama provider — acquires the best available key from the database,
 * respecting concurrency (1 req at a time), 5hr window limits, and weekly limits.
 * Call releaseOllamaKey() when the request completes.
 */
async function getOllamaCloudProviderFromDB(): Promise<{ provider: ReturnType<typeof createOpenAI>, keyId: number } | null> {
  try {
    const { getServerSupabase } = await import('@/lib/supabase')
    const supabase = getServerSupabase()

    const now = new Date().toISOString()
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString()
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    // Reset stale concurrency locks (keys stuck in_use for >3 minutes = crashed request)
    await supabase
      .from('ollama_keys')
      .update({ in_use: false, in_use_since: null })
      .eq('in_use', true)
      .lt('in_use_since', new Date(Date.now() - 3 * 60 * 1000).toISOString())

    // Reset 5hr window counters for keys whose window expired
    await supabase
      .from('ollama_keys')
      .update({ requests_in_window: 0, window_start_at: null })
      .lt('window_start_at', fiveHoursAgo)
      .gt('requests_in_window', 0)

    // Reset weekly counters for keys whose week expired
    await supabase
      .from('ollama_keys')
      .update({ requests_in_week: 0, week_start_at: null })
      .lt('week_start_at', sevenDaysAgo)
      .gt('requests_in_week', 0)

    // Pick the best available key:
    // - Must be active and not in_use (concurrency = 1)
    // - Prefer keys with fewer requests_in_window (spread load)
    // - Prefer keys with oldest last_used_at (maximize cooldown)
    // - Skip keys with too many errors
    const { data: keys, error } = await supabase
      .from('ollama_keys')
      .select('id, api_key, requests_in_window, requests_in_week, last_used_at')
      .eq('is_active', true)
      .eq('in_use', false)
      .lt('consecutive_errors', 5)
      .order('requests_in_window', { ascending: true })
      .order('last_used_at', { ascending: true, nullsFirst: true })
      .limit(1)

    if (error || !keys || keys.length === 0) {
      console.warn('[OllamaDB] No available keys from DB, falling back to env rotation')
      return null
    }

    const key = keys[0]

    // Acquire the key: mark in_use + update counters atomically
    const { error: updateError } = await supabase
      .from('ollama_keys')
      .update({
        in_use: true,
        in_use_since: now,
        last_used_at: now,
        requests_in_window: key.requests_in_window + 1,
        window_start_at: key.requests_in_window === 0 ? now : undefined,
        requests_in_week: key.requests_in_week + 1,
        week_start_at: key.requests_in_week === 0 ? now : undefined,
        updated_at: now,
      })
      .eq('id', key.id)
      .eq('in_use', false) // Optimistic lock — if another request grabbed it, this fails

    if (updateError) {
      console.warn('[OllamaDB] Failed to acquire key (race condition), falling back')
      return null
    }

    console.log(`[OllamaDB] Acquired key #${key.id} (window: ${key.requests_in_window + 1}, week: ${key.requests_in_week + 1})`)

    const provider = createOpenAI({
      name: 'ollama-cloud',
      baseURL: 'https://ollama.com/v1',
      apiKey: key.api_key,
    })

    return { provider, keyId: key.id }
  } catch (err) {
    console.error('[OllamaDB] Error acquiring key:', err)
    return null
  }
}

/**
 * Release an Ollama key after request completes.
 * Call with success=true on success, success=false on provider error.
 */
export async function releaseOllamaKey(keyId: number, success: boolean, errorMessage?: string) {
  try {
    const { getServerSupabase } = await import('@/lib/supabase')
    const supabase = getServerSupabase()

    const update: Record<string, any> = {
      in_use: false,
      in_use_since: null,
      updated_at: new Date().toISOString(),
    }

    if (success) {
      update.consecutive_errors = 0
    } else {
      update.last_error_at = new Date().toISOString()
      update.last_error_message = errorMessage?.slice(0, 500) || 'Unknown error'
      // Increment consecutive_errors — will be auto-disabled at 5
    }

    if (success) {
      await supabase
        .from('ollama_keys')
        .update(update)
        .eq('id', keyId)
    } else {
      // Use RPC-like approach: read then write to increment
      const { data: current } = await supabase
        .from('ollama_keys')
        .select('consecutive_errors')
        .eq('id', keyId)
        .single()

      const newErrors = (current?.consecutive_errors || 0) + 1
      update.consecutive_errors = newErrors
      if (newErrors >= 5) {
        update.is_active = false
        console.warn(`[OllamaDB] Key #${keyId} disabled after ${newErrors} consecutive errors`)
      }

      await supabase
        .from('ollama_keys')
        .update(update)
        .eq('id', keyId)
    }

    console.log(`[OllamaDB] Released key #${keyId} (success: ${success})`)
  } catch (err) {
    console.error('[OllamaDB] Error releasing key:', err)
  }
}

/**
 * Get the next Bonsai API key using round-robin rotation.
 * Supports comma-separated keys in BONSAI_API_KEY env var.
 * e.g. BONSAI_API_KEY="key1,key2,key3"
 */
export function getNextBonsaiKey(): string {
  const raw = process.env.BONSAI_API_KEY || '';
  const keys = raw.split(',').map(k => k.trim()).filter(Boolean);
  if (keys.length === 0) return '';
  const key = keys[_bonsaiKeyIndex % keys.length];
  _bonsaiKeyIndex = (_bonsaiKeyIndex + 1) % keys.length;
  return key;
}

// ─── AI Gateway Configuration (Agent Cloud) ──────────────────────────────────
// Primary: Praxis API (configured via ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN)
// Fallback: Bonsai AI Gateway (go.trybons.ai) via BONSAI_API_KEY
// Claude Agent SDK reads ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN to route requests.

export interface AIGatewayConfig {
  provider: 'praxis' | 'bonsai'
  baseUrl: string
  authToken: string
  models: {
    sonnet: string
    opus: string
    haiku: string
    flash?: string
  }
}

const BONSAI_BASE_URL = 'https://go.trybons.ai'

/**
 * Primary gateway: Praxis API.
 * Returns null if ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN are not configured
 * or if ANTHROPIC_BASE_URL points to Bonsai (meaning Bonsai is the configured primary).
 */
export function getPrimaryGatewayConfig(): AIGatewayConfig | null {
  const baseUrl = (process.env.ANTHROPIC_BASE_URL || '').trim()
  const token = (process.env.ANTHROPIC_AUTH_TOKEN || '').trim()
  if (!baseUrl || !token) return null
  // If ANTHROPIC_BASE_URL is Bonsai, primary = Bonsai (skip Praxis path)
  if (baseUrl.includes('go.trybons.ai')) return null

  const sonnet = (process.env.ANTHROPIC_DEFAULT_SONNET_MODEL || '').trim() || 'claude-sonnet-4-6'
  const opus = (process.env.ANTHROPIC_DEFAULT_OPUS_MODEL || '').trim() || sonnet
  const haiku = (process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL || '').trim() || sonnet

  return {
    provider: 'praxis',
    baseUrl,
    authToken: token,
    models: { sonnet, opus, haiku, flash: sonnet },
  }
}

/**
 * Bonsai fallback gateway.
 * Returns null if BONSAI_API_KEY is not configured.
 */
export function getBonsaiGatewayConfig(): AIGatewayConfig | null {
  const key = getNextBonsaiKey()
  if (!key) return null
  return {
    provider: 'bonsai',
    baseUrl: BONSAI_BASE_URL,
    authToken: key,
    models: {
      sonnet: 'anthropic/claude-sonnet-4.5',
      opus: 'anthropic/claude-opus-4',
      haiku: 'openai/gpt-5.1-codex',
      flash: 'z-ai/glm-4.6',
    },
  }
}

/**
 * Resolve the active AI gateway configuration for agent-cloud requests.
 * Tries Praxis first (if configured), falls back to Bonsai.
 * Throws if neither is configured.
 */
export function getAIGatewayConfig(): AIGatewayConfig {
  const primary = getPrimaryGatewayConfig()
  if (primary) return primary
  const bonsai = getBonsaiGatewayConfig()
  if (bonsai) return bonsai
  throw new Error(
    'No AI gateway configured: set ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN (Praxis) ' +
    'or BONSAI_API_KEY (Bonsai fallback).'
  )
}

/**
 * Get the next Kilo API key using round-robin rotation.
 * Supports comma-separated keys in KILO_API_KEY env var.
 * e.g. KILO_API_KEY="key1,key2,key3"
 */
export function getNextKiloKey(): string {
  const raw = process.env.KILO_API_KEY || '';
  const keys = raw.split(',').map(k => k.trim()).filter(Boolean);
  if (keys.length === 0) return '';
  const key = keys[_kiloKeyIndex % keys.length];
  _kiloKeyIndex = (_kiloKeyIndex + 1) % keys.length;
  return key;
}

/**
 * Get the next Ollama API key using round-robin rotation.
 * Supports comma-separated keys in OLLAMA_API_KEY env var.
 * e.g. OLLAMA_API_KEY="key1,key2,key3"
 */
export function getNextOllamaKey(): string {
  const raw = process.env.OLLAMA_API_KEY || '';
  const keys = raw.split(',').map(k => k.trim()).filter(Boolean);
  if (keys.length === 0) return '';
  const key = keys[_ollamaKeyIndex % keys.length];
  _ollamaKeyIndex = (_ollamaKeyIndex + 1) % keys.length;
  return key;
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

    // Kilo AI Gateway models (free tier)
    case 'kilo/auto-free':
      return getKiloGateway()('kilo/auto-free');
    case 'kilo/minimax-m2.5-free':
      return getKiloGateway()('minimax/minimax-m2.5:free');
    case 'kilo/kimi-k2.5-free':
      return getKiloGateway()('moonshotai/kimi-k2.5:free');
    case 'kilo/giga-potato':
      return getKiloGateway()('giga-potato-thinking');
    case 'kilo/step-3.5-flash-free':
      return getKiloGateway()('stepfun/step-3.5-flash:free');

    // Ollama Cloud models — sync fallback (env-based rotation)
    // For DB-backed rotation, use getOllamaModel() instead
    case 'ollama/devstral-2:123b':
    case 'ollama/qwen3-coder:480b':
    case 'ollama/qwen3-coder-next':
    case 'ollama/qwen3.5:397b':
    case 'ollama/deepseek-v3.1:671b':
    case 'ollama/deepseek-v3.2':
    case 'ollama/glm-4.6':
    case 'ollama/glm-4.7':
    case 'ollama/kimi-k2.5':
    case 'ollama/kimi-k2-thinking':
    case 'ollama/minimax-m2.7':
    case 'ollama/minimax-m2.5':
    case 'ollama/minimax-m2.1':
    case 'ollama/kimi-k2:1t': {
      const ollamaModelName = modelId.replace('ollama/', '');
      return getOllamaCloudProvider()(ollamaModelName);
    }

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

/**
 * Get an Ollama model with DB-backed key rotation.
 * Returns { model, keyId } where keyId must be passed to releaseOllamaKey() after use.
 * Falls back to env-based rotation if DB is unavailable.
 */
export async function getOllamaModel(modelId: string): Promise<{ model: any, keyId: number | null }> {
  const ollamaModelName = modelId.replace('ollama/', '')

  // Try DB-backed rotation first
  const dbResult = await getOllamaCloudProviderFromDB()
  if (dbResult) {
    return {
      model: dbResult.provider(ollamaModelName),
      keyId: dbResult.keyId,
    }
  }

  // Fallback to env-based rotation
  return {
    model: getOllamaCloudProvider()(ollamaModelName),
    keyId: null,
  }
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

// =============================================================================
// BYOK (Bring Your Own Key) - Dynamic provider creation with user API keys
// =============================================================================
// These functions create fresh provider instances using user-supplied API keys.
// They are NOT cached because each user has different keys.

export interface ByokKeySet {
  openai?: string
  anthropic?: string
  mistral?: string
  xai?: string
  google?: string
  ollama?: string
  kilo?: string
  openrouter?: string
  'vercel-gateway'?: string
  // Custom providers: keyed by custom provider ID
  [key: string]: string | undefined | {
    apiKey: string
    baseUrl: string
    providerType: 'openai-compatible' | 'anthropic-compatible'
  }
}

/**
 * Resolve which BYOK provider to use for a given model ID.
 * Returns the provider ID (e.g. 'openai', 'anthropic') or null if no match.
 */
export function resolveByokProvider(modelId: string, byokKeys: ByokKeySet): string | null {
  // Check direct provider prefixes
  if (modelId.startsWith('anthropic/') && byokKeys.anthropic) return 'anthropic'
  if (modelId.startsWith('openai/') && byokKeys.openai) return 'openai'
  if (modelId.startsWith('mistral/') && byokKeys.mistral) return 'mistral'
  if (modelId.startsWith('xai/') && byokKeys.xai) return 'xai'
  if (modelId.startsWith('google/') && byokKeys.google) return 'google'
  if (modelId.startsWith('ollama/') && byokKeys.ollama) return 'ollama'
  if (modelId.startsWith('kilo/') && byokKeys.kilo) return 'kilo'

  // Direct model names
  if ((modelId === 'pixtral-12b-2409' || modelId === 'codestral-latest') && byokKeys.mistral) return 'mistral'
  if (modelId === 'auto' && byokKeys.xai) return 'xai'

  // Check custom providers (objects with apiKey+baseUrl)
  for (const [key, value] of Object.entries(byokKeys)) {
    if (value && typeof value === 'object' && 'apiKey' in value) {
      return key // Custom provider ID
    }
  }

  // OpenRouter as universal fallback (can handle any model)
  if (byokKeys.openrouter) return 'openrouter'

  // Vercel AI Gateway as fallback
  if (byokKeys['vercel-gateway']) return 'vercel-gateway'

  return null
}

/**
 * Create a model instance using BYOK (user-provided) API keys.
 * Returns null if the model/provider combo isn't supported for BYOK.
 */
export function createByokModel(modelId: string, byokKeys: ByokKeySet): any | null {
  const providerId = resolveByokProvider(modelId, byokKeys)
  if (!providerId) return null

  const keyValue = byokKeys[providerId]

  // Handle custom provider (object with apiKey + baseUrl)
  if (keyValue && typeof keyValue === 'object' && 'apiKey' in keyValue) {
    const custom = keyValue as { apiKey: string; baseUrl: string; providerType: 'openai-compatible' | 'anthropic-compatible' }
    if (custom.providerType === 'anthropic-compatible') {
      const provider = createAnthropic({
        apiKey: custom.apiKey,
        baseURL: custom.baseUrl,
      })
      // Strip provider prefix for the model name sent to the API
      const bareModel = modelId.includes('/') ? modelId : modelId
      return provider(bareModel)
    } else {
      // Default: openai-compatible
      const provider = createOpenAICompatible({
        name: `byok-custom-${providerId}`,
        baseURL: custom.baseUrl,
        apiKey: custom.apiKey,
      })
      const bareModel = modelId.includes('/') ? modelId.split('/').slice(1).join('/') : modelId
      return provider(bareModel)
    }
  }

  const apiKey = keyValue as string
  if (!apiKey) return null

  // Extract the model name without provider prefix for direct API calls
  const stripPrefix = (id: string, prefix: string) =>
    id.startsWith(prefix) ? id.slice(prefix.length) : id

  switch (providerId) {
    case 'openai': {
      const provider = createOpenAI({ apiKey })
      const bare = stripPrefix(modelId, 'openai/')
      return provider(bare)
    }
    case 'anthropic': {
      const provider = createAnthropic({ apiKey })
      // Anthropic API expects model IDs like 'claude-sonnet-4-5-20250514'
      // but we receive 'anthropic/claude-sonnet-4.5' from the model selector
      return provider(modelId)
    }
    case 'mistral': {
      const provider = createMistral({ apiKey })
      const bare = stripPrefix(modelId, 'mistral/')
      return provider(bare)
    }
    case 'xai': {
      const provider = createXai({ apiKey })
      const bare = stripPrefix(modelId, 'xai/')
      return provider(bare)
    }
    case 'google': {
      // Google uses OpenAI-compatible endpoint via Gemini API
      const provider = createOpenAICompatible({
        name: 'byok-google',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
        apiKey,
      })
      const bare = stripPrefix(modelId, 'google/')
      return provider(bare)
    }
    case 'ollama': {
      const provider = createOpenAICompatible({
        name: 'byok-ollama',
        baseURL: 'https://ollama.com/v1',
        apiKey,
      })
      const bare = stripPrefix(modelId, 'ollama/')
      return provider(bare)
    }
    case 'kilo': {
      const provider = createOpenAICompatible({
        name: 'byok-kilo',
        baseURL: 'https://api.kilo.ai/api/gateway',
        apiKey,
      })
      // Map internal model IDs to Kilo gateway model IDs
      const kiloModelMap: Record<string, string> = {
        'kilo/auto-free': 'kilo/auto-free',
        'kilo/minimax-m2.5-free': 'minimax/minimax-m2.5:free',
        'kilo/kimi-k2.5-free': 'moonshotai/kimi-k2.5:free',
        'kilo/giga-potato': 'giga-potato-thinking',
        'kilo/step-3.5-flash-free': 'stepfun/step-3.5-flash:free',
      }
      const kiloModel = kiloModelMap[modelId] || modelId.replace('kilo/', '')
      return provider(kiloModel)
    }
    case 'openrouter': {
      const provider = createOpenAICompatible({
        name: 'byok-openrouter',
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey,
        headers: {
          'HTTP-Referer': 'https://pipilot.dev',
          'X-Title': 'PiPilot',
        },
      })
      return provider(modelId)
    }
    case 'vercel-gateway': {
      const provider = createOpenAICompatible({
        name: 'byok-vercel-gateway',
        baseURL: 'https://ai-gateway.vercel.sh/v1',
        apiKey,
      })
      return provider(modelId)
    }
    default:
      return null
  }
}

/**
 * Parse BYOK keys from the X-Byok-Keys request header.
 * Returns null if no BYOK keys are present.
 */
export function parseByokKeysFromHeader(request: Request): ByokKeySet | null {
  const header = request.headers.get('x-byok-keys')
  if (!header) return null
  try {
    const decoded = Buffer.from(header, 'base64').toString('utf-8')
    const keys = JSON.parse(decoded) as ByokKeySet
    // Validate at least one key is present
    const hasKey = Object.values(keys).some(v => {
      if (typeof v === 'string') return v.length > 0
      if (v && typeof v === 'object' && 'apiKey' in v) return v.apiKey.length > 0
      return false
    })
    return hasKey ? keys : null
  } catch {
    console.warn('[AI Providers] Failed to parse BYOK keys from header')
    return null
  }
}
