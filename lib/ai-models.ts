export const DEFAULT_CHAT_MODEL: string = 'ollama/nemotron-3-super';

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
    id: 'ollama/nemotron-3-super',
    name: 'Titan Pro',
    description: 'Fastest all-rounder — 80 tok/s, strong on architecture and system design',
    provider: 'ollama',
  },
  {
    id: 'ollama/devstral-2:123b',
    name: 'Devstral Code 123B',
    description: 'Precision code specialist — cleanest output, fewest bugs',
    provider: 'ollama',
  },
  {
    id: 'ollama/qwen3-coder:480b',
    name: 'Qwen Coder 480B',
    description: '480B MoE built for coding agents — massive context window',
    provider: 'ollama',
  },
  {
    id: 'ollama/qwen3-coder-next',
    name: 'Qwen Coder Next',
    description: 'Next-gen Qwen coding model with extended context',
    provider: 'ollama',
  },
  {
    id: 'ollama/minimax-m2.5',
    name: 'Atlas M2.5',
    description: 'Deep analysis and reasoning — best at finding bugs and edge cases',
    provider: 'ollama',
  },
  {
    id: 'ollama/minimax-m2.1',
    name: 'Atlas M2.1',
    description: 'Solid general-purpose coding with reliable output',
    provider: 'ollama',
  },
  {
    id: 'ollama/cogito-2.1:671b',
    name: 'Cogito 671B',
    description: '671B reasoning-heavy model for complex logic and algorithms',
    provider: 'ollama',
  },
  {
    id: 'ollama/gemma4:31b',
    name: 'Gemma 4',
    description: 'Google Gemma 4 — fast and capable for frontend scaffolding',
    provider: 'ollama',
  },
  {
    id: 'ollama/glm-4.6',
    name: 'GLM 4.6',
    description: 'Strong multi-purpose model for code and reasoning',
    provider: 'ollama',
  },
  {
    id: 'ollama/gpt-oss:120b',
    name: 'Nova 120B',
    description: '120B open-source powerhouse for large codebases',
    provider: 'ollama',
  },
  {
    id: 'ollama/gpt-oss:20b',
    name: 'Nova Flash',
    description: 'Ultra-fast 20B model for quick edits and autocomplete',
    provider: 'ollama',
  },
  {
    id: 'ollama/qwen3-vl:235b',
    name: 'Qwen Vision 235B',
    description: '235B multimodal model — understands images and screenshots',
    provider: 'ollama',
    supportsVision: true,
  },
  {
    id: 'ollama/nemotron-3-nano:30b',
    name: 'Titan Nano',
    description: 'Lightweight 30B model for fast iterations and small tasks',
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