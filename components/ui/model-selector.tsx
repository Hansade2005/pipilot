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
  // Ollama Cloud models
  ['ollama/nemotron-3-super', 'Titan Pro'],
  ['ollama/devstral-2:123b', 'Devstral Code 123B'],
  ['ollama/qwen3-coder:480b', 'Qwen Coder 480B'],
  ['ollama/qwen3-coder-next', 'Qwen Coder Next'],
  ['ollama/minimax-m2.5', 'Atlas M2.5'],
  ['ollama/minimax-m2.1', 'Atlas M2.1'],
  ['ollama/cogito-2.1:671b', 'Cogito 671B'],
  ['ollama/gemma4:31b', 'Gemma 4'],
  ['ollama/glm-4.6', 'GLM 4.6'],
  ['ollama/gpt-oss:120b', 'Nova 120B'],
  ['ollama/gpt-oss:20b', 'Nova Flash'],
  ['ollama/qwen3-vl:235b', 'Qwen Vision 235B'],
  ['ollama/nemotron-3-nano:30b', 'Titan Nano'],
  // Kilo AI Gateway models
  ['kilo/auto-free', 'Kilo Auto'],
  ['kilo/minimax-m2.5-free', 'MiniMax M2.5'],
  ['kilo/kimi-k2.5-free', 'Kimi K2.5'],
  ['kilo/giga-potato', 'Giga Potato'],
  ['kilo/step-3.5-flash-free', 'Step Flash'],
])

// Descriptions for dropdown
const descriptionMap = new Map<string, string>([
  ['auto', 'Automatically picks the best model'],
  ['mistral/devstral-2', 'Fast code generation'],
  ['mistral/devstral-small-2', 'Lightweight and efficient'],
  ['xai/grok-code-fast-1', 'Fast code with xAI'],
  // Ollama Cloud models
  ['ollama/nemotron-3-super', 'Fastest all-rounder with strong architecture'],
  ['ollama/devstral-2:123b', 'Precision code specialist, fewest bugs'],
  ['ollama/qwen3-coder:480b', '480B MoE built for coding agents'],
  ['ollama/qwen3-coder-next', 'Next-gen Qwen coding model'],
  ['ollama/minimax-m2.5', 'Deep analysis and bug-finding'],
  ['ollama/minimax-m2.1', 'Reliable general-purpose coding'],
  ['ollama/cogito-2.1:671b', '671B reasoning for complex logic'],
  ['ollama/gemma4:31b', 'Google Gemma 4 for fast scaffolding'],
  ['ollama/glm-4.6', 'Strong multi-purpose coding model'],
  ['ollama/gpt-oss:120b', '120B open-source powerhouse'],
  ['ollama/gpt-oss:20b', 'Ultra-fast for quick edits'],
  ['ollama/qwen3-vl:235b', '235B multimodal with vision'],
  ['ollama/nemotron-3-nano:30b', 'Lightweight 30B for fast iterations'],
  // Kilo AI Gateway models
  ['kilo/auto-free', 'Auto-picks best model via Kilo'],
  ['kilo/minimax-m2.5-free', 'MiniMax M2.5 via Kilo'],
  ['kilo/kimi-k2.5-free', 'Kimi K2.5 multimodal via Kilo'],
  ['kilo/giga-potato', 'Agentic programming via Kilo'],
  ['kilo/step-3.5-flash-free', 'Fast reasoning via Kilo'],
])

// Map BYOK provider IDs to model ID prefixes
const BYOK_PROVIDER_MODEL_PREFIXES: Record<string, string[]> = {
  openai: ['openai/'],
  anthropic: ['anthropic/'],
  mistral: ['mistral/'],
  xai: ['xai/'],
  google: ['google/'],
  ollama: ['ollama/'],
  kilo: ['kilo/'],
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
  const defaultSelectedModel: string = 'ollama/nemotron-3-super'
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
      'ollama/nemotron-3-super', 'ollama/devstral-2:123b',
      'ollama/qwen3-coder:480b', 'ollama/qwen3-coder-next',
      'ollama/minimax-m2.5', 'ollama/minimax-m2.1',
      'ollama/cogito-2.1:671b', 'ollama/gemma4:31b', 'ollama/glm-4.6',
      'ollama/gpt-oss:120b', 'ollama/gpt-oss:20b',
      'ollama/qwen3-vl:235b', 'ollama/nemotron-3-nano:30b',
      'kilo/auto-free', 'kilo/minimax-m2.5-free', 'kilo/kimi-k2.5-free',
      'kilo/giga-potato', 'kilo/step-3.5-flash-free'
    ]
  } else if (isPremium && effectiveStatus === 'active') {
    allowedModels = [
      'auto', 'mistral/devstral-2', 'mistral/devstral-small-2', 'xai/grok-code-fast-1',
      'ollama/nemotron-3-super', 'ollama/devstral-2:123b',
      'ollama/qwen3-coder:480b', 'ollama/qwen3-coder-next',
      'ollama/minimax-m2.5', 'ollama/minimax-m2.1',
      'ollama/cogito-2.1:671b', 'ollama/gemma4:31b', 'ollama/glm-4.6',
      'ollama/gpt-oss:120b', 'ollama/gpt-oss:20b',
      'ollama/qwen3-vl:235b', 'ollama/nemotron-3-nano:30b',
      'kilo/auto-free', 'kilo/minimax-m2.5-free', 'kilo/kimi-k2.5-free',
      'kilo/giga-potato', 'kilo/step-3.5-flash-free'
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
    'ollama/nemotron-3-super', 'ollama/devstral-2:123b', 'ollama/minimax-m2.5',
    'mistral/devstral-2', 'mistral/devstral-small-2',
    'xai/grok-code-fast-1',
    'ollama/qwen3-coder:480b', 'ollama/qwen3-coder-next',
    'ollama/minimax-m2.1', 'ollama/cogito-2.1:671b', 'ollama/gemma4:31b',
    'ollama/glm-4.6', 'ollama/gpt-oss:120b', 'ollama/gpt-oss:20b',
    'ollama/qwen3-vl:235b', 'ollama/nemotron-3-nano:30b',
    'kilo/auto-free', 'kilo/minimax-m2.5-free', 'kilo/kimi-k2.5-free',
    'kilo/giga-potato', 'kilo/step-3.5-flash-free',
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
