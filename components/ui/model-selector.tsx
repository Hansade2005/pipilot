"use client"

import React, { useState, useRef, useEffect } from 'react'
import { Check, Lock, ChevronDown } from 'lucide-react'
import { chatModels, type ChatModel, getModelById } from '@/lib/ai-models'
import { getLimits } from '@/lib/stripe-config'

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
])

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
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const effectiveStatus = subscriptionStatus || (userPlan === 'free' ? 'active' : 'inactive')
  const isPremium = ['pro', 'creator', 'teams', 'collaborate', 'enterprise', 'scale'].includes(userPlan)
  const defaultSelectedModel: string = isPremium ? 'anthropic/claude-sonnet-4.5' : 'xai/grok-code-fast-1'
  const effectiveSelectedModel = selectedModel || defaultSelectedModel

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
      'openai/gpt-5.1-thinking', 'openai/gpt-5.2-codex', 'openai/o3'
    ]
  } else {
    const userLimits = getLimits(userPlan)
    allowedModels = userLimits.allowedModels || ['auto']
  }

  const isModelAllowed = (modelId: string) => allowedModels.includes(modelId)

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

  const displayName = shortNameMap.get(effectiveSelectedModel) || effectiveSelectedModel.split('/').pop() || effectiveSelectedModel

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
        <ChevronDown className={`size-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className={`absolute ${dropdownDirection === 'down' ? 'top-8' : 'bottom-8'} ${dropdownAlign === 'left' ? 'left-0' : 'right-0'} w-[240px] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-[100] overflow-hidden ${dropdownClassName}`}>
          <div className="max-h-[320px] overflow-y-auto py-1">
            {orderedModels.map((modelId) => {
              const allowed = isModelAllowed(modelId)
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
                    <div className="text-[11px] text-gray-500 truncate">{desc}</div>
                  </div>
                  <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                    {!allowed && <Lock className="size-3 text-gray-500" />}
                    {isSelected && allowed && <Check className="size-4 text-orange-400" />}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
