"use client"

import React from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Bot, Lock, Crown } from 'lucide-react'
import { chatModels, type ChatModel, getModelById } from '@/lib/ai-models'
import { getLimits } from '@/lib/stripe-config'

interface ModelSelectorProps {
  selectedModel?: string
  onModelChange: (modelId: string) => void
  userPlan?: string
  subscriptionStatus?: string
  className?: string
  compact?: boolean
}

// No visual badges/colors needed — keep data simple (provider groups and model names)

export function ModelSelector({
  selectedModel,
  onModelChange,
  userPlan = 'free',
  subscriptionStatus,
  className = '',
  compact = true
}: ModelSelectorProps) {
  // Default subscription status based on plan (matches admin page behavior)
  const effectiveStatus = subscriptionStatus || (userPlan === 'free' ? 'active' : 'inactive')

  // Set default selected model based on plan
  // Premium plans: creator/collaborate/scale (or legacy: pro/teams/enterprise)
  const isPremium = ['pro', 'creator', 'teams', 'collaborate', 'enterprise', 'scale'].includes(userPlan)
  const defaultSelectedModel: string = isPremium ? 'anthropic/claude-sonnet-4.5' : 'xai/grok-code-fast-1'
  const effectiveSelectedModel = selectedModel || defaultSelectedModel

  const currentModel = getModelById(effectiveSelectedModel)

  const displayNameMap = new Map<string, string>([
    // Auto/Default Option
    ['auto', 'PiPilot Auto'],
    // Vercel AI Gateway Models
    ['mistral/devstral-2', 'PiPilot Mistral Devstral 2'],
    ['mistral/devstral-small-2', 'PiPilot Mistral Devstral Small 2'],
    ['xai/grok-code-fast-1', 'PiPilot xAI Grok Code Fast 1'],
    ['moonshotai/kimi-k2-thinking', 'PiPilot MoonshotAI Kimi K2 Thinking'],
    ['google/gemini-2.5-flash', 'PiPilot Google Gemini 2.5 Flash'],
    ['google/gemini-2.5-pro', 'PiPilot Google Gemini 2.5 Pro'],
    ['xai/glm-4.7', 'PiPilot xAI GLM 4.7'],
    ['zai/glm-4.7-flash', 'PiPilot ZAI GLM 4.7 Flash'],
    ['minimax/minimax-m2.1', 'PiPilot MiniMax M2.1'],
    ['alibaba/qwen3-max', 'PiPilot Alibaba Qwen3 Max'],
    ['anthropic/claude-haiku-4.5', 'PiPilot Anthropic Claude Haiku 4.5'],
    ['anthropic/claude-sonnet-4.5', 'PiPilot Anthropic Claude Sonnet 4.5'],
    ['anthropic/claude-opus-4.5', 'PiPilot Anthropic Claude Opus 4.5'],
    ['openai/gpt-5.1-thinking', 'PiPilot OpenAI GPT-5.1 Thinking'],
    ['openai/gpt-5.2-codex', 'PiPilot OpenAI GPT-5.2 Codex'],
    ['openai/o3', 'PiPilot OpenAI O3'],
  ])

  const filteredModels = chatModels.filter(model => displayNameMap.has(model.id))

  // Group models by provider for better organization
  const modelsByProvider = filteredModels.reduce((acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = []
    }
    acc[model.provider].push(model)
    return acc
  }, {} as Record<string, ChatModel[]>)

  // Determine allowed models based on subscription status and plan
  const userLimits = getLimits(userPlan)

  // Set specific allowed models per plan
  let allowedModels: string[]
  if (userPlan === 'free') {
    allowedModels = [
      'xai/grok-code-fast-1',
      'mistral/devstral-2',
      'mistral/devstral-small-2',
      'google/gemini-2.5-flash',
      'zai/glm-4.7-flash',
      'anthropic/claude-sonnet-4.5'
    ];
  } else if (isPremium && effectiveStatus === 'active') {
    // All premium plans get full access: creator/collaborate/scale (and legacy: pro/teams/enterprise)
    allowedModels = [
      // Free models (premium users get access to everything)
      'mistral/devstral-2',
      'mistral/devstral-small-2',
      'xai/grok-code-fast-1',
      'google/gemini-2.5-flash',
      'zai/glm-4.7-flash',
      // Premium models
      'auto',
      'moonshotai/kimi-k2-thinking',
      'google/gemini-2.5-pro',
      'xai/glm-4.7',
      'minimax/minimax-m2.1',
      'alibaba/qwen3-max',
      'anthropic/claude-haiku-4.5',
      'anthropic/claude-sonnet-4.5',
      'anthropic/claude-opus-4.5',
      'openai/gpt-5.1-thinking',
      'openai/gpt-5.2-codex',
      'openai/o3'
    ];
  } else {
    // Fallback for inactive subscriptions or other cases
    allowedModels = userLimits.allowedModels || ['auto']
  }

  // Helper function to check if model is allowed
  const isModelAllowed = (modelId: string) => allowedModels.includes(modelId)

  // Function to truncate text to 3 characters for all models
  const truncateModelName = (text: string | undefined) => {
    if (!text) return '';

    // Strip "PiPilot " prefix for compact display
    const cleaned = text.replace(/^PiPilot\s+/i, '')

    // Truncate to 10 characters with ellipsis
    return cleaned.length > 10 ? cleaned.substring(0, 10) + '...' : cleaned;
  };

  if (compact) {
    return (
      <div className={`flex items-center ${className}`}>
        <Select value={effectiveSelectedModel} onValueChange={onModelChange}>
          {/* Match AiModeSelector compact trigger: small height, tight padding, no border, rely on shared chevron */}
          <SelectTrigger className="h-6 px-2 min-w-[56px] border-0 bg-transparent text-xs shadow-none focus:ring-0 p-0">
            <div className="flex items-center justify-center w-full">
              <SelectValue>
                <span className="font-medium text-sm leading-none text-center">{truncateModelName(displayNameMap.get(effectiveSelectedModel) || currentModel?.name || effectiveSelectedModel)}</span>
              </SelectValue>
            </div>
          </SelectTrigger>

          <SelectContent align="start" className="w-[260px] bg-popover text-popover-foreground border z-[100]">
            {Object.entries(modelsByProvider).map(([provider, models]) => (
              <div key={provider} className="py-1">
                <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  PiPilot
                </div>
                {models.map((model) => {
                  const allowed = isModelAllowed(model.id)
                  return (
                    <SelectItem
                      key={model.id}
                      value={model.id}
                      disabled={!allowed}
                      className={`text-sm px-3 py-1 ${!allowed ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span>{displayNameMap.get(model.id) || model.name}</span>
                        {!allowed && <Lock className="h-3 w-3 text-muted-foreground ml-2" />}
                        {allowed && isPremium && effectiveStatus === 'active' && (
                          <Crown className="h-3 w-3 text-yellow-500 ml-2" />
                        )}
                      </div>
                    </SelectItem>
                  )
                })}
              </div>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  // Full-size selector for non-compact mode
  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">AI Model</span>
      </div>

      <Select value={effectiveSelectedModel} onValueChange={onModelChange}>
        <SelectTrigger className="w-full">
          <div className="flex items-center gap-2">
            <SelectValue>
              <span className="font-medium">{truncateModelName(displayNameMap.get(effectiveSelectedModel) || currentModel?.name || effectiveSelectedModel)}</span>
            </SelectValue>
          </div>
        </SelectTrigger>

        <SelectContent className="w-[420px] z-[100]">
          {Object.entries(modelsByProvider).map(([provider, models]) => (
            <div key={provider} className="py-2">
              <div className="px-3 py-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide border-b">
                PiPilot
              </div>
              {models.map((model) => {
                const allowed = isModelAllowed(model.id)
                return (
                  <SelectItem
                    key={model.id}
                    value={model.id}
                    disabled={!allowed}
                    className={`p-3 text-sm ${!allowed ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div>
                        <div className="font-medium">{displayNameMap.get(model.id) || model.name}</div>
                        <div className="text-xs text-muted-foreground">{model.description}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!allowed && <Lock className="h-4 w-4 text-muted-foreground" />}
                        {allowed && isPremium && effectiveStatus === 'active' && (
                          <Crown className="h-4 w-4 text-yellow-500" />
                        )}
                      </div>
                    </div>
                  </SelectItem>
                )
              })}
            </div>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}