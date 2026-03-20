export const DEFAULT_CHAT_MODEL: string = 'ollama/minimax-m2.7';

export interface ChatModel {
  id: string;
  name: string;
  description: string;
  provider: string;
  supportsVision?: boolean; // Whether model can process images directly
  premiumOnly?: boolean; // Whether model requires a paid plan
}

export const chatModels: Array<ChatModel> = [
  // Auto/Default Option
  {
    id: 'auto',
    name: 'Auto',
    description: 'Automatically uses the best model for code generation',
    provider: 'vercel-gateway',
  },

  // Codestral Models (Custom)
  {
    id: 'codestral-latest',
    name: 'Codestral',
    description: 'Mistral Codestral model via custom endpoint',
    provider: 'codestral',
  },

  // a0.dev Models (Custom)
  {
    id: 'a0-dev-llm',
    name: 'Pixela',
    description: 'Pixela model from PiPilot with strong code generation capabilities',
    provider: 'a0dev',
  },

  // Mistral Models
  {
    id: 'pixtral-12b-2409',
    name: 'Pixtral 12B',
    description: 'Mistral multimodal model with vision capabilities',
    provider: 'mistral',
    supportsVision: true,
  },

  // Vercel AI Gateway Models (kept: Devstral + Grok Fast only)
  {
    id: 'mistral/devstral-2',
    name: 'Mistral Devstral 2',
    description: 'Mistral Devstral 2 via Vercel AI Gateway',
    provider: 'vercel-gateway',
    supportsVision: true,
  },
  {
    id: 'mistral/devstral-small-2',
    name: 'Mistral Devstral Small 2',
    description: 'Mistral Devstral Small 2 - Fast and efficient code generation',
    provider: 'vercel-gateway',
    supportsVision: true,
  },
  {
    id: 'xai/grok-code-fast-1',
    name: 'xAI Grok Code Fast 1',
    description: 'xAI Grok Code Fast 1 via Vercel AI Gateway',
    provider: 'vercel-gateway',
  },

  // Kilo AI Gateway Models
  {
    id: 'kilo/auto-free',
    name: 'Kilo Auto',
    description: 'Auto-routes to the best model via Kilo',
    provider: 'kilo',
  },
  {
    id: 'kilo/minimax-m2.5-free',
    name: 'MiniMax M2.5 via Kilo',
    description: 'MiniMax M2.5 - 80.2% SWE-Bench via Kilo',
    provider: 'kilo',
  },
  {
    id: 'kilo/kimi-k2.5-free',
    name: 'Kimi K2.5 via Kilo',
    description: 'Kimi K2.5 multimodal coding via Kilo',
    provider: 'kilo',
    supportsVision: true,
  },
  {
    id: 'kilo/giga-potato',
    name: 'Giga Potato via Kilo',
    description: 'Optimized for agentic programming via Kilo',
    provider: 'kilo',
  },
  {
    id: 'kilo/step-3.5-flash-free',
    name: 'Step 3.5 Flash via Kilo',
    description: 'Fast reasoning model (196B MoE) via Kilo',
    provider: 'kilo',
  },

  // Ollama Cloud Models
  {
    id: 'ollama/devstral-2:123b',
    name: 'Devstral 2 123B',
    description: 'Devstral 2 123B via Ollama Cloud',
    provider: 'ollama',
  },
  {
    id: 'ollama/qwen3-coder:480b',
    name: 'Qwen3 Coder 480B',
    description: 'Qwen3 Coder 480B - Purpose-built for coding via Ollama Cloud',
    provider: 'ollama',
  },
  {
    id: 'ollama/qwen3-coder-next',
    name: 'Qwen3 Coder Next',
    description: 'Qwen3 Coder Next - Next-gen coding model via Ollama Cloud',
    provider: 'ollama',
  },
  {
    id: 'ollama/qwen3.5:397b',
    name: 'Qwen3.5 397B',
    description: 'Qwen3.5 397B - Latest flagship with excellent reasoning via Ollama Cloud',
    provider: 'ollama',
  },
  {
    id: 'ollama/deepseek-v3.1:671b',
    name: 'DeepSeek V3.1 671B',
    description: 'DeepSeek V3.1 671B - Proven for code, full model via Ollama Cloud',
    provider: 'ollama',
  },
  {
    id: 'ollama/deepseek-v3.2',
    name: 'DeepSeek V3.2',
    description: 'DeepSeek V3.2 via Ollama Cloud',
    provider: 'ollama',
  },
  {
    id: 'ollama/glm-4.6',
    name: 'GLM 4.6',
    description: 'GLM 4.6 via Ollama Cloud',
    provider: 'ollama',
  },
  {
    id: 'ollama/glm-4.7',
    name: 'GLM 4.7',
    description: 'GLM 4.7 via Ollama Cloud',
    provider: 'ollama',
  },
  {
    id: 'ollama/kimi-k2.5',
    name: 'Kimi K2.5',
    description: 'Kimi K2.5 via Ollama Cloud - 262K context',
    provider: 'ollama',
    supportsVision: true,
  },
  {
    id: 'ollama/kimi-k2-thinking',
    name: 'Kimi K2 Thinking',
    description: 'Kimi K2 Thinking via Ollama Cloud',
    provider: 'ollama',
  },
  {
    id: 'ollama/minimax-m2.7',
    name: 'Claude Opus 4.6',
    description: 'Most capable model for ambitious, complex work',
    provider: 'ollama',
  },
  {
    id: 'ollama/minimax-m2.1',
    name: 'Claude Sonnet 4.6',
    description: 'Best balance of speed and quality for coding',
    provider: 'ollama',
  },
  {
    id: 'ollama/kimi-k2:1t',
    name: 'Kimi K2 1T',
    description: 'Kimi K2 1T parameter model via Ollama Cloud',
    provider: 'ollama',
  },

];

export function getModelById(modelId: string): ChatModel | undefined {
  return chatModels.find(model => model.id === modelId);
}

/**
 * Get the user-facing display name for any model ID.
 * Uses the chatModels registry first, then falls back to a short name extraction.
 * This is the single source of truth for disguised model names everywhere:
 * model selector, chat panel, usage logs, DB storage descriptions, analytics, etc.
 */
export function getDisplayModelName(modelId: string): string {
  const model = getModelById(modelId)
  if (model) return model.name
  // Fallback: strip provider prefix and return the bare model name
  return modelId.split('/').pop() || modelId
}

export function modelSupportsVision(modelId: string): boolean {
  const model = getModelById(modelId);
  return model?.supportsVision ?? false;
}

export function getModelsByProvider(provider: string): ChatModel[] {
  return chatModels.filter(model => model.provider === provider);
}

export function getAllProviders(): string[] {
  return Array.from(new Set(chatModels.map(model => model.provider)));
}