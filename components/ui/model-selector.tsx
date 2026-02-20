"use client"

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { Check, Lock, ChevronDown, Key } from 'lucide-react'
import { chatModels, type ChatModel, getModelById } from '@/lib/ai-models'
import { getLimits } from '@/lib/stripe-config'
import type { ByokConfig, ByokProviderKey } from '@/lib/storage-manager'

interface ModelSelectorProps {
  selectedModel?: string
  onModelChange: (modelId: string) => void
  userPlan?: string
  subscriptionStatus?: string
  className?: string
  compact?: boolean
  dropdownAlign?: 'left' | 'right'
  dropdownDirection?: 'up' | 'down'
  dropdownClassName?: string
  byokConfig?: ByokConfig | null
}

// Short, clean display names (like Anthropic's "Opus 4.6", "Sonnet 4.5")
const shortNameMap = new Map<string, string>([
  ['auto', 'Auto'],
  ['mistral/devstral-2', 'Devstral 2'],
  ['mistral/devstral-small-2', 'Devstral S2'],
  ['xai/grok-code-fast-1', 'Grok Fast'],
  ['xai/grok-4.1-fast-reasoning', 'Grok 4.1 R'],
  ['xai/grok-4.1-fast-non-reasoning', 'Grok 4.1 NR'],
  ['moonshotai/kimi-k2-thinking', 'Kimi K2'],
  ['google/gemini-2.5-flash', 'Gemini Flash'],
  ['google/gemini-2.5-pro', 'Gemini Pro'],
  ['xai/glm-4.7', 'GLM 4.7'],
  ['zai/glm-4.7-flash', 'GLM Flash'],
  ['minimax/minimax-m2.1', 'MiniMax M2'],
  ['kwaipilot/kat-coder-pro-v1', 'KAT Coder'],
  ['alibaba/qwen3-max', 'Qwen3 Max'],
  ['alibaba/qwen3-vl-thinking', 'Qwen3 VL'],
  ['anthropic/claude-haiku-4.5', 'Haiku 4.5'],
  ['anthropic/claude-sonnet-4.5', 'Sonnet 4.5'],
  ['anthropic/claude-opus-4.5', 'Opus 4.5'],
  ['openai/gpt-5.1-thinking', 'GPT-5.1'],
  ['openai/gpt-5.2-codex', 'Codex 5.2'],
  ['openai/o3', 'O3'],
  ['bonsai/claude-sonnet-4.5', 'Sonnet 4.5 (Bonsai)'],
  ['bonsai/claude-opus-4', 'Opus 4 (Bonsai)'],
  ['bonsai/gpt-5.1-codex', 'Codex 5.1 (Bonsai)'],
  ['bonsai/glm-4.6', 'GLM 4.6 (Bonsai)'],
])

// Descriptions for dropdown
const descriptionMap = new Map<string, string>([
  ['auto', 'Automatically picks the best model'],
  ['mistral/devstral-2', 'Fast code generation'],
  ['mistral/devstral-small-2', 'Lightweight and efficient'],
  ['xai/grok-code-fast-1', 'Fast code with xAI'],
  ['xai/grok-4.1-fast-reasoning', 'Fast reasoning by xAI'],
  ['xai/grok-4.1-fast-non-reasoning', 'Fast non-reasoning by xAI'],
  ['moonshotai/kimi-k2-thinking', 'Deep reasoning model'],
  ['google/gemini-2.5-flash', 'Fast multimodal by Google'],
  ['google/gemini-2.5-pro', 'Most capable Google model'],
  ['xai/glm-4.7', 'General language model'],
  ['zai/glm-4.7-flash', 'Fast general language model'],
  ['minimax/minimax-m2.1', 'Efficient code generation'],
  ['kwaipilot/kat-coder-pro-v1', 'Fast code by KwaiPilot'],
  ['alibaba/qwen3-max', 'Most capable Qwen model'],
  ['alibaba/qwen3-vl-thinking', 'Vision-language with reasoning'],
  ['anthropic/claude-haiku-4.5', 'Fast and lightweight'],
  ['anthropic/claude-sonnet-4.5', 'Best balance of speed and quality'],
  ['anthropic/claude-opus-4.5', 'Most capable for ambitious work'],
  ['openai/gpt-5.1-thinking', 'Deep reasoning by OpenAI'],
  ['openai/gpt-5.2-codex', 'Specialized for code'],
  ['openai/o3', 'Advanced reasoning model'],
  ['bonsai/claude-sonnet-4.5', 'Sonnet 4.5 via Bonsai'],
  ['bonsai/claude-opus-4', 'Opus 4 via Bonsai'],
  ['bonsai/gpt-5.1-codex', 'GPT-5.1 Codex via Bonsai'],
  ['bonsai/glm-4.6', 'GLM 4.6 via Bonsai'],
])

// Map BYOK provider IDs to model ID prefixes
const BYOK_PROVIDER_MODEL_PREFIXES: Record<string, string[]> = {
  openai: ['openai/'],
  anthropic: ['anthropic/'],
  mistral: ['mistral/'],
  xai: ['xai/'],
  google: ['google/'],
  bonsai: ['bonsai/'],
  openrouter: [], // OpenRouter unlocks all models
  'vercel-gateway': [], // Vercel Gateway unlocks all models
}

export function ModelSelector({
  selectedModel,
  onModelChange,
  userPlan = 'free',
  subscriptionStatus,
  className = '',
  compact = true,
  dropdownAlign = 'right',
  dropdownDirection = 'up',
  dropdownClassName = '',
  byokConfig,
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const effectiveStatus = subscriptionStatus || (userPlan === 'free' ? 'active' : 'inactive')
  const isPremium = ['pro', 'creator', 'teams', 'collaborate', 'enterprise', 'scale'].includes(userPlan)
  const defaultSelectedModel: string = isPremium ? 'anthropic/claude-sonnet-4.5' : 'xai/grok-code-fast-1'
  const effectiveSelectedModel = selectedModel || defaultSelectedModel

  // Determine active BYOK providers
  const activeByokProviders = useMemo(() => {
    if (!byokConfig?.enabled) return []
    return byokConfig.keys.filter(k => k.enabled && k.apiKey)
  }, [byokConfig])

  const isByokActive = activeByokProviders.length > 0
  const hasUniversalByok = activeByokProviders.some(
    k => k.providerId === 'openrouter' || k.providerId === 'vercel-gateway'
  )

  // Collect model IDs that BYOK unlocks
  const byokUnlockedModelIds = useMemo(() => {
    if (!isByokActive) return new Set<string>()
    if (hasUniversalByok) {
      // OpenRouter or Vercel Gateway unlocks everything
      return new Set(shortNameMap.keys())
    }
    const unlocked = new Set<string>()
    for (const key of activeByokProviders) {
      const prefixes = BYOK_PROVIDER_MODEL_PREFIXES[key.providerId]
      if (prefixes && prefixes.length > 0) {
        for (const [modelId] of shortNameMap) {
          if (prefixes.some(prefix => modelId.startsWith(prefix))) {
            unlocked.add(modelId)
          }
        }
      }
    }
    return unlocked
  }, [activeByokProviders, isByokActive, hasUniversalByok])

  // Collect custom BYOK models (from custom providers with customModels)
  const customByokModels = useMemo(() => {
    if (!isByokActive) return []
    const models: Array<{ id: string; name: string; description: string; providerLabel: string }> = []
    for (const key of activeByokProviders) {
      if (key.customModels && key.customModels.length > 0) {
        for (const modelId of key.customModels) {
          if (!shortNameMap.has(modelId)) {
            models.push({
              id: modelId,
              name: modelId.split('/').pop() || modelId,
              description: `via ${key.label || key.providerId}`,
              providerLabel: key.label || key.providerId,
            })
          }
        }
      }
    }
    return models
  }, [activeByokProviders, isByokActive])

  // Allowed models per plan
  let allowedModels: string[]
  if (userPlan === 'free') {
    allowedModels = [
      'xai/grok-code-fast-1', 'mistral/devstral-2', 'mistral/devstral-small-2',
      'google/gemini-2.5-flash', 'zai/glm-4.7-flash', 'anthropic/claude-sonnet-4.5'
    ]
  } else if (isPremium && effectiveStatus === 'active') {
    allowedModels = [
      'auto', 'mistral/devstral-2', 'mistral/devstral-small-2', 'xai/grok-code-fast-1',
      'xai/grok-4.1-fast-reasoning', 'xai/grok-4.1-fast-non-reasoning',
      'google/gemini-2.5-flash', 'zai/glm-4.7-flash', 'moonshotai/kimi-k2-thinking',
      'google/gemini-2.5-pro', 'xai/glm-4.7', 'minimax/minimax-m2.1',
      'kwaipilot/kat-coder-pro-v1', 'alibaba/qwen3-max',
      'alibaba/qwen3-vl-thinking',
      'anthropic/claude-haiku-4.5', 'anthropic/claude-sonnet-4.5', 'anthropic/claude-opus-4.5',
      'openai/gpt-5.1-thinking', 'openai/gpt-5.2-codex', 'openai/o3',
      'bonsai/claude-sonnet-4.5', 'bonsai/claude-opus-4', 'bonsai/gpt-5.1-codex', 'bonsai/glm-4.6'
    ]
  } else {
    const userLimits = getLimits(userPlan)
    allowedModels = userLimits.allowedModels || ['auto']
  }

  // Model is allowed if plan allows it OR BYOK unlocks it
  const isModelAllowed = (modelId: string) =>
    allowedModels.includes(modelId) || byokUnlockedModelIds.has(modelId)

  // Check if a model is specifically unlocked by BYOK (not by plan)
  const isByokUnlocked = (modelId: string) =>
    !allowedModels.includes(modelId) && byokUnlockedModelIds.has(modelId)

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen])

  const isCustomByokModel = customByokModels.some(m => m.id === effectiveSelectedModel)
  const displayName = shortNameMap.get(effectiveSelectedModel)
    || (isCustomByokModel ? customByokModels.find(m => m.id === effectiveSelectedModel)?.name : null)
    || effectiveSelectedModel.split('/').pop()
    || effectiveSelectedModel

  // Ordered model list for the dropdown
  const modelOrder = [
    'anthropic/claude-opus-4.5', 'anthropic/claude-sonnet-4.5', 'anthropic/claude-haiku-4.5',
    'openai/gpt-5.1-thinking', 'openai/gpt-5.2-codex', 'openai/o3',
    'google/gemini-2.5-pro', 'google/gemini-2.5-flash',
    'mistral/devstral-2', 'mistral/devstral-small-2',
    'xai/grok-code-fast-1', 'xai/grok-4.1-fast-reasoning', 'xai/grok-4.1-fast-non-reasoning',
    'xai/glm-4.7', 'zai/glm-4.7-flash',
    'moonshotai/kimi-k2-thinking', 'minimax/minimax-m2.1', 'kwaipilot/kat-coder-pro-v1',
    'alibaba/qwen3-max', 'alibaba/qwen3-vl-thinking',
    'bonsai/claude-sonnet-4.5', 'bonsai/claude-opus-4', 'bonsai/gpt-5.1-codex', 'bonsai/glm-4.6',
    'auto',
  ]
  const orderedModels = modelOrder.filter(id => shortNameMap.has(id))

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Trigger: clean text + chevron like Anthropic */}
      <button
        type="button"
        className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="font-medium">{displayName}</span>
        {isByokActive && (isByokUnlocked(effectiveSelectedModel) || isCustomByokModel) && (
          <Key className="size-3 text-orange-400" />
        )}
        <ChevronDown className={`size-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className={`absolute ${dropdownDirection === 'down' ? 'top-8' : 'bottom-8'} ${dropdownAlign === 'left' ? 'left-0' : 'right-0'} w-[240px] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-[100] overflow-hidden ${dropdownClassName}`}>
          <div className="max-h-[380px] overflow-y-auto py-1">
            {/* Platform models */}
            {orderedModels.map((modelId) => {
              const allowed = isModelAllowed(modelId)
              const byokOnly = isByokUnlocked(modelId)
              const isSelected = modelId === effectiveSelectedModel
              const name = shortNameMap.get(modelId) || modelId
              const desc = descriptionMap.get(modelId) || ''

              return (
                <button
                  key={modelId}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors ${
                    !allowed ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-800 cursor-pointer'
                  } ${isSelected ? 'bg-gray-800/50' : ''}`}
                  onClick={() => {
                    if (!allowed) return
                    onModelChange(modelId)
                    setIsOpen(false)
                  }}
                  disabled={!allowed}
                >
                  <div className="min-w-0">
                    <div className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-gray-200'}`}>
                      {name}
                    </div>
                    <div className="text-[11px] text-gray-500 truncate">
                      {byokOnly ? `${desc} (BYOK)` : desc}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                    {byokOnly && <Key className="size-3 text-orange-400" />}
                    {!allowed && <Lock className="size-3 text-gray-500" />}
                    {isSelected && allowed && <Check className="size-4 text-orange-400" />}
                  </div>
                </button>
              )
            })}

            {/* Custom BYOK provider models */}
            {customByokModels.length > 0 && (
              <>
                <div className="px-4 py-2 border-t border-gray-700/60">
                  <div className="flex items-center gap-1.5 text-[11px] text-orange-400 font-medium uppercase tracking-wider">
                    <Key className="size-3" />
                    Your Models
                  </div>
                </div>
                {customByokModels.map((model) => {
                  const isSelected = model.id === effectiveSelectedModel
                  return (
                    <button
                      key={model.id}
                      className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-gray-800 cursor-pointer ${isSelected ? 'bg-gray-800/50' : ''}`}
                      onClick={() => {
                        onModelChange(model.id)
                        setIsOpen(false)
                      }}
                    >
                      <div className="min-w-0">
                        <div className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-gray-200'}`}>
                          {model.name}
                        </div>
                        <div className="text-[11px] text-gray-500 truncate">{model.description}</div>
                      </div>
                      <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                        <Key className="size-3 text-orange-400" />
                        {isSelected && <Check className="size-4 text-orange-400" />}
                      </div>
                    </button>
                  )
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
