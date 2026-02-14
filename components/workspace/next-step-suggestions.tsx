'use client'

import React, { useState, useEffect } from 'react'
import { ArrowRight, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NextStepSuggestion {
  label: string
  prompt: string
}

interface NextStepSuggestionsProps {
  suggestions: NextStepSuggestion[]
  onSuggestionClick: (prompt: string) => void
  isVisible: boolean
}

export function NextStepSuggestions({ suggestions, onSuggestionClick, isVisible }: NextStepSuggestionsProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (isVisible) {
      // Small delay for smooth entrance after stream ends
      const timer = setTimeout(() => setMounted(true), 150)
      return () => clearTimeout(timer)
    } else {
      setMounted(false)
    }
  }, [isVisible])

  if (!isVisible || suggestions.length === 0) return null

  return (
    <div
      className={cn(
        'flex flex-wrap gap-2 pt-3 pb-1 transition-all duration-500',
        mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      )}
    >
      {suggestions.map((suggestion, index) => (
        <button
          key={index}
          onClick={() => onSuggestionClick(suggestion.prompt)}
          className={cn(
            'group flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-medium',
            'border border-gray-700/60 bg-gray-900/60 text-gray-300',
            'hover:border-orange-500/50 hover:bg-orange-600/10 hover:text-orange-300',
            'active:scale-[0.97] transition-all duration-200',
            'cursor-pointer select-none',
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
          )}
          style={{
            transitionDelay: mounted ? `${index * 75}ms` : '0ms'
          }}
        >
          <span>{suggestion.label}</span>
          <ArrowRight className="w-3 h-3 text-gray-500 group-hover:text-orange-400 transition-colors shrink-0" />
        </button>
      ))}
    </div>
  )
}

/**
 * Extracts suggest_next_steps data from tool calls array.
 * Returns the suggestions array if found, otherwise empty array.
 */
export function extractNextStepSuggestions(
  toolCalls: Array<{ toolName: string; input?: any; status: string }> | undefined
): NextStepSuggestion[] {
  if (!toolCalls || toolCalls.length === 0) return []

  const suggestionCall = toolCalls.find(
    tc => tc.toolName === 'suggest_next_steps' && (tc.status === 'completed' || tc.status === 'executing')
  )

  if (!suggestionCall?.input?.suggestions) return []

  return suggestionCall.input.suggestions.filter(
    (s: any) => s && typeof s.label === 'string' && typeof s.prompt === 'string'
  )
}
