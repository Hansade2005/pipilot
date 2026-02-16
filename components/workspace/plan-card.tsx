'use client'

import React from 'react'
import {
  Plan,
  PlanHeader,
  PlanTitle,
  PlanDescription,
  PlanTrigger,
  PlanContent,
  PlanFooter,
} from '@/components/ai-elements/plan'
import { FileText, Layers, CheckCircle2, ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PlanStep {
  title: string
  description: string
}

interface PlanCardProps {
  title: string
  description: string
  steps: PlanStep[]
  techStack?: string[]
  estimatedFiles?: number
  isStreaming?: boolean
  status?: 'planning' | 'building' | 'completed'
}

export function PlanCard({
  title,
  description,
  steps,
  techStack,
  estimatedFiles,
  isStreaming = false,
  status = 'planning',
}: PlanCardProps) {
  return (
    <Plan defaultOpen={true} isStreaming={isStreaming}>
      <PlanHeader>
        <div className="flex-1 min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-orange-600/15">
              <Layers className="size-3.5 text-orange-400" />
            </div>
            <PlanTitle>{title}</PlanTitle>
          </div>
          <PlanDescription>{description}</PlanDescription>

          {/* Tech Stack & File Count Badges */}
          {(techStack?.length || estimatedFiles) && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {techStack?.map((tech, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center rounded-md bg-gray-800 px-2 py-0.5 text-xs text-gray-300 border border-gray-700/60"
                >
                  {tech}
                </span>
              ))}
              {estimatedFiles && (
                <span className="inline-flex items-center gap-1 rounded-md bg-orange-500/10 px-2 py-0.5 text-xs text-orange-400 border border-orange-500/20">
                  <FileText className="size-3" />
                  ~{estimatedFiles} files
                </span>
              )}
            </div>
          )}
        </div>
        <PlanTrigger />
      </PlanHeader>

      <PlanContent>
        <div className="space-y-1">
          {steps.map((step, idx) => (
            <div
              key={idx}
              className={cn(
                "flex gap-3 rounded-lg px-3 py-2.5 transition-colors",
                "hover:bg-gray-800/50"
              )}
            >
              {/* Step Number */}
              <div className="flex-shrink-0 mt-0.5">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-600/15 text-[10px] font-semibold text-orange-400">
                  {idx + 1}
                </div>
              </div>

              {/* Step Content */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-200">{step.title}</div>
                <div className="mt-0.5 text-xs text-gray-500 leading-relaxed">{step.description}</div>
              </div>

              {/* Step Arrow */}
              <div className="flex-shrink-0 mt-0.5">
                <ChevronRight className="size-3.5 text-gray-600" />
              </div>
            </div>
          ))}
        </div>
      </PlanContent>

      {/* Status Footer */}
      <PlanFooter className="justify-center">
        {status === 'planning' && (
          <div className="inline-flex items-center gap-2 rounded-lg bg-orange-500/10 px-3 py-1.5 border border-orange-500/20">
            <Loader2 className="size-3.5 text-orange-400 animate-spin" />
            <span className="text-xs font-medium text-orange-400">Planning...</span>
          </div>
        )}
        {status === 'building' && (
          <div className="inline-flex items-center gap-2 rounded-lg bg-orange-500/10 px-3 py-1.5 border border-orange-500/20">
            <Loader2 className="size-3.5 text-orange-400 animate-spin" />
            <span className="text-xs font-medium text-orange-400">Building...</span>
          </div>
        )}
        {status === 'completed' && (
          <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-1.5 border border-emerald-500/20">
            <CheckCircle2 className="size-3.5 text-emerald-400" />
            <span className="text-xs font-medium text-emerald-400">Completed</span>
          </div>
        )}
      </PlanFooter>
    </Plan>
  )
}
