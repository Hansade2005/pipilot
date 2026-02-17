'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  Plan,
  PlanHeader,
  PlanTitle,
  PlanDescription,
  PlanTrigger,
  PlanContent,
  PlanFooter,
} from '@/components/ai-elements/plan'
import { FileText, Layers, CheckCircle2, Circle, Loader2 } from 'lucide-react'
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
  projectId?: string
}

// Parse plan.md content to get completed step numbers
function parseCompletedSteps(content: string): Set<number> {
  const completed = new Set<number>()
  const regex = /### Step (\d+):.*\n- \*\*Status:\*\* \[x\] Completed/g
  let match
  while ((match = regex.exec(content)) !== null) {
    completed.add(parseInt(match[1], 10))
  }
  return completed
}

export function PlanCard({
  title,
  description,
  steps,
  techStack,
  estimatedFiles,
  isStreaming = false,
  status = 'planning',
  projectId,
}: PlanCardProps) {
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set())

  const readPlanFile = useCallback(async () => {
    if (!projectId) return
    try {
      const { storageManager } = await import('@/lib/storage-manager')
      await storageManager.init()
      const file = await storageManager.getFile(projectId, '.pipilot/plan.md')
      if (file?.content) {
        setCompletedSteps(parseCompletedSteps(file.content))
      }
    } catch {
      // File may not exist yet during planning phase
    }
  }, [projectId])

  // Read plan file on mount and when status changes
  useEffect(() => {
    readPlanFile()
  }, [readPlanFile, status])

  // Listen for file changes to update in real-time
  useEffect(() => {
    if (!projectId || typeof window === 'undefined') return

    const handleFilesChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail as { projectId: string }
      if (detail.projectId === projectId) {
        readPlanFile()
      }
    }

    window.addEventListener('files-changed', handleFilesChanged)
    return () => window.removeEventListener('files-changed', handleFilesChanged)
  }, [projectId, readPlanFile])

  const totalSteps = steps.length
  const doneCount = completedSteps.size
  const allDone = totalSteps > 0 && doneCount >= totalSteps
  const progressPercent = totalSteps > 0 ? Math.round((doneCount / totalSteps) * 100) : 0

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
          {steps.map((step, idx) => {
            const stepNum = idx + 1
            const isDone = completedSteps.has(stepNum)
            return (
              <div
                key={idx}
                className={cn(
                  "flex gap-3 rounded-lg px-3 py-2.5 transition-colors",
                  "hover:bg-gray-800/50"
                )}
              >
                {/* Step Status Icon */}
                <div className="flex-shrink-0 mt-0.5">
                  {isDone ? (
                    <CheckCircle2 className="size-5 text-emerald-400" />
                  ) : (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-600/15 text-[10px] font-semibold text-orange-400">
                      {stepNum}
                    </div>
                  )}
                </div>

                {/* Step Content */}
                <div className="flex-1 min-w-0">
                  <div className={cn(
                    "text-sm font-medium",
                    isDone ? "text-gray-400 line-through decoration-gray-600" : "text-gray-200"
                  )}>{step.title}</div>
                  <div className="mt-0.5 text-xs text-gray-500 leading-relaxed">{step.description}</div>
                </div>

                {/* Step Status Badge */}
                <div className="flex-shrink-0 mt-0.5">
                  {isDone ? (
                    <span className="text-[10px] font-medium text-emerald-500">Done</span>
                  ) : (
                    <Circle className="size-3.5 text-gray-600" />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </PlanContent>

      {/* Status Footer */}
      <PlanFooter className="flex-col gap-2">
        {/* Progress Bar */}
        {status !== 'planning' && totalSteps > 0 && (
          <div className="w-full flex items-center gap-3">
            <div className="flex-1 h-1.5 rounded-full bg-gray-800 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500 ease-out",
                  allDone ? "bg-emerald-500" : "bg-orange-500"
                )}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className={cn(
              "text-[10px] font-medium tabular-nums whitespace-nowrap",
              allDone ? "text-emerald-400" : "text-gray-500"
            )}>
              {doneCount}/{totalSteps}
            </span>
          </div>
        )}

        {/* Status Badge */}
        <div className="flex justify-center">
          {status === 'planning' && (
            <div className="inline-flex items-center gap-2 rounded-lg bg-orange-500/10 px-3 py-1.5 border border-orange-500/20">
              <Loader2 className="size-3.5 text-orange-400 animate-spin" />
              <span className="text-xs font-medium text-orange-400">Planning...</span>
            </div>
          )}
          {status === 'building' && (
            <div className="inline-flex items-center gap-2 rounded-lg bg-orange-500/10 px-3 py-1.5 border border-orange-500/20">
              <Loader2 className="size-3.5 text-orange-400 animate-spin" />
              <span className="text-xs font-medium text-orange-400">
                {doneCount > 0 ? `Building... ${doneCount}/${totalSteps} Steps Completed` : 'Building...'}
              </span>
            </div>
          )}
          {status === 'completed' && (
            <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-1.5 border border-emerald-500/20">
              <CheckCircle2 className="size-3.5 text-emerald-400" />
              <span className="text-xs font-medium text-emerald-400">
                {allDone ? `All ${totalSteps} Steps Completed` : `${doneCount}/${totalSteps} Steps Completed`}
              </span>
            </div>
          )}
        </div>
      </PlanFooter>
    </Plan>
  )
}
