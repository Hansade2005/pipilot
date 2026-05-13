"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  Sparkles,
  Loader2,
  Check,
  Send,
  RotateCcw,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Action Protocol ─────────────────────────────────────────────────────────
// The AI embeds commands like [[ACTION:OPTIONS|...]] in its response.
// We parse them out, show clean text + interactive UI elements, and collect answers.

type WizardActionType =
  | "OPTIONS"        // Single-select option cards: [[ACTION:OPTIONS|label1|label2|label3]]
  | "MULTI_SELECT"   // Multi-select checkboxes: [[ACTION:MULTI_SELECT|label1|label2|label3]]
  | "TEXT_INPUT"      // Free-text input: [[ACTION:TEXT_INPUT|placeholder text]]
  | "FRAMEWORK"      // Framework selection (maps to our supported frameworks): [[ACTION:FRAMEWORK|nextjs|vite-react|expo]]
  | "DONE"           // Final prompt ready: [[ACTION:DONE|framework|the generated prompt...]]

interface ParsedAction {
  type: WizardActionType
  params: string[]
  raw: string
}

interface WizardMessage {
  role: "assistant" | "user"
  text: string
  actions?: ParsedAction[]
  selectedOptions?: string[]
  textInput?: string
}

const ACTION_REGEX = /\[\[ACTION:(\w+)\|((?:[^\]]|\][^\]])*?)\]\]/g

function parseActions(text: string): { cleanText: string; actions: ParsedAction[] } {
  const actions: ParsedAction[] = []

  const cleanText = text.replace(ACTION_REGEX, (match, type, paramStr) => {
    actions.push({
      type: type as WizardActionType,
      params: paramStr.split("|").map((p: string) => p.trim()),
      raw: match,
    })
    return ""
  })

  return { cleanText: cleanText.trim(), actions }
}

// ─── System prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are PiPilot's Launch Wizard AI. You help users plan their app by asking smart, conversational questions one at a time. Your goal is to collect enough context to generate a comprehensive development prompt.

## Action Protocol
You MUST embed action tags in your responses to create interactive UI. Available actions:

- [[ACTION:OPTIONS|Option A|Option B|Option C]] — Show single-select cards. User picks one.
- [[ACTION:MULTI_SELECT|Option A|Option B|Option C]] — Show multi-select checkboxes. User picks one or more.
- [[ACTION:TEXT_INPUT|Placeholder text here...]] — Show a text input field for free-form answers.
- [[ACTION:FRAMEWORK|nextjs|vite-react|expo]] — Special framework selector (MUST use exactly these IDs). Use this when asking about platform/framework.
- [[ACTION:DONE|framework_id|The full generated prompt goes here...]] — Output the final development prompt. framework_id must be one of: nextjs, vite-react, expo.

## Platform Limitations (IMPORTANT)
PiPilot supports 3 frameworks — each for a specific use case:
- **vite-react**: Frontend-only SPAs (websites, dashboards, landing pages, tools). Backend via Supabase or Vercel Serverless Functions.
- **nextjs**: Full-stack web apps with SSR/SSG, API routes, server actions. Best for apps that need a backend.
- **expo**: Cross-platform mobile apps (iOS, Android, Web).

What PiPilot CANNOT do:
- Standalone backend servers (Express, Fastify, Django, Rails, Flask, Spring, etc.)
- Separate backend + frontend architectures (no "build frontend with React and backend with Express")
- Docker, Kubernetes, or server infrastructure

If the user needs backend functionality, guide them:
- Full-stack app → recommend **nextjs** (has built-in API routes and server actions)
- Frontend-only with database → recommend **vite-react** with Supabase (database, auth, storage — natively integrated)
- Client-side storage → Dexie/IndexedDB for offline-first apps

If the user explicitly asks for a non-supported framework or a separate backend, politely explain: "PiPilot doesn't support standalone backend servers. For full-stack apps, I'd recommend Next.js which has built-in API routes. For frontend-only apps, Vite+React with Supabase handles database needs. Which approach works for you?"

## Rules
1. Ask ONE question at a time with exactly ONE action tag per message.
2. Start by asking what the user wants to build (use OPTIONS with common app categories).
3. Follow up with smart questions based on their answers — audience, key features, design preferences, specific pages/flows, etc.
4. Ask 3-6 total questions (adapt based on complexity — simple apps need fewer questions).
5. When you have enough context, output [[ACTION:DONE|framework_id|prompt]] with a comprehensive development prompt.
6. Keep your question text brief and friendly (1-2 sentences max before the action tag).
7. Make options contextual — if they said "e-commerce", offer e-commerce-relevant features, not generic ones.
8. Always include the FRAMEWORK action in one of your questions (you need to know the target platform).
9. The final prompt in DONE should be detailed: list pages, components, features, data models, design direction, and interactions.
10. Write naturally — you're having a conversation, not running a form.
11. If the user mentions a non-supported backend/framework, clarify the platform limitations and suggest the supported alternative BEFORE continuing with questions.`

// ─── Component ───────────────────────────────────────────────────────────────

interface LaunchWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: (generatedPrompt: string, framework: string) => void
}

export function LaunchWizard({ open, onOpenChange, onComplete }: LaunchWizardProps) {
  const [messages, setMessages] = useState<WizardMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedOptions, setSelectedOptions] = useState<string[]>([])
  const [textInput, setTextInput] = useState("")
  const [currentAction, setCurrentAction] = useState<ParsedAction | null>(null)
  const [hasStarted, setHasStarted] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const apiMessages = useRef<{ role: string; content: string }[]>([])

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isLoading])

  // Start the conversation when dialog opens
  useEffect(() => {
    if (open && !hasStarted) {
      setHasStarted(true)
      callAI()
    }
  }, [open, hasStarted])

  const callAI = useCallback(async (userMessage?: string) => {
    setIsLoading(true)
    setCurrentAction(null)
    setSelectedOptions([])
    setTextInput("")

    // Build API messages
    if (apiMessages.current.length === 0) {
      apiMessages.current = [{ role: "system", content: SYSTEM_PROMPT }]
    }

    if (userMessage) {
      apiMessages.current.push({ role: "user", content: userMessage })
      setMessages(prev => [...prev, { role: "user", text: userMessage }])
    }

    try {
      const response = await fetch("https://api.a0.dev/ai/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages.current }),
      })

      if (!response.ok) throw new Error("API request failed")

      const data = await response.json()
      const rawText = data.completion || ""

      apiMessages.current.push({ role: "assistant", content: rawText })

      const { cleanText, actions } = parseActions(rawText)

      // Check if AI is done
      const doneAction = actions.find(a => a.type === "DONE")
      if (doneAction && doneAction.params.length >= 2) {
        const framework = doneAction.params[0]
        const prompt = doneAction.params.slice(1).join("|")

        setMessages(prev => [...prev, {
          role: "assistant",
          text: cleanText || "Your app plan is ready! Launching the builder...",
          actions: [],
        }])

        // Small delay for the user to see the final message
        setTimeout(() => {
          onComplete(prompt, framework)
          handleClose()
        }, 800)
        return
      }

      const primaryAction = actions[0] || null
      setCurrentAction(primaryAction)

      setMessages(prev => [...prev, {
        role: "assistant",
        text: cleanText,
        actions,
      }])
    } catch (error) {
      console.error("Launch Wizard AI error:", error)
      // Fallback: show a text input so the user can still describe their app
      setCurrentAction({ type: "TEXT_INPUT", params: ["Describe the app you want to build..."], raw: "" })
      setMessages(prev => [...prev, {
        role: "assistant",
        text: "Tell me about the app you want to build and I'll create a development plan for you.",
        actions: [{ type: "TEXT_INPUT", params: ["Describe the app you want to build..."], raw: "" }],
      }])
    } finally {
      setIsLoading(false)
    }
  }, [onComplete])

  const handleOptionSelect = useCallback((option: string) => {
    if (!currentAction) return

    if (currentAction.type === "MULTI_SELECT") {
      setSelectedOptions(prev =>
        prev.includes(option) ? prev.filter(o => o !== option) : [...prev, option]
      )
    } else if (currentAction.type === "OPTIONS" || currentAction.type === "FRAMEWORK") {
      // Single select — submit immediately
      setSelectedOptions([option])
      // Update message with selection then send
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last?.role === "assistant") {
          return [...prev.slice(0, -1), { ...last, selectedOptions: [option] }]
        }
        return prev
      })
      setTimeout(() => callAI(option), 150)
    }
  }, [currentAction, callAI])

  const handleSubmit = useCallback(() => {
    if (!currentAction) return

    if (currentAction.type === "MULTI_SELECT" && selectedOptions.length > 0) {
      const answer = selectedOptions.join(", ")
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last?.role === "assistant") {
          return [...prev.slice(0, -1), { ...last, selectedOptions }]
        }
        return prev
      })
      callAI(answer)
    } else if (currentAction.type === "TEXT_INPUT" && textInput.trim()) {
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last?.role === "assistant") {
          return [...prev.slice(0, -1), { ...last, textInput }]
        }
        return prev
      })
      callAI(textInput.trim())
    }
  }, [currentAction, selectedOptions, textInput, callAI])

  const handleReset = useCallback(() => {
    setMessages([])
    setIsLoading(false)
    setSelectedOptions([])
    setTextInput("")
    setCurrentAction(null)
    setHasStarted(false)
    apiMessages.current = []
  }, [])

  const handleClose = useCallback(() => {
    onOpenChange(false)
    setTimeout(handleReset, 300)
  }, [onOpenChange, handleReset])

  // Check if the current action is already answered (not the latest)
  const isLatestAssistantMessage = (msgIndex: number) => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return i === msgIndex
    }
    return false
  }

  const frameworkLabels: Record<string, string> = {
    "nextjs": "Next.js (Full-Stack)",
    "vite-react": "Vite + React (SPA)",
    "expo": "Expo (Mobile)",
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) handleClose()
      else onOpenChange(true)
    }}>
      <DialogContent className="sm:max-w-[580px] bg-gray-950 border-gray-800 p-0 gap-0 overflow-hidden max-h-[85vh] flex flex-col">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-800/60 flex-shrink-0">
          <DialogTitle className="text-lg font-semibold text-white flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            AI Launch Wizard
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-400">
            AI will ask smart questions to understand your app, then generate the perfect prompt.
          </DialogDescription>
        </DialogHeader>

        {/* Conversation */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-[300px] max-h-[55vh]">
          {messages.map((msg, idx) => (
            <div key={idx}>
              {msg.role === "user" ? (
                /* User message bubble */
                <div className="flex justify-end">
                  <div className="bg-orange-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[85%] text-sm">
                    {msg.text}
                  </div>
                </div>
              ) : (
                /* Assistant message + actions */
                <div className="space-y-3">
                  {msg.text && (
                    <div className="flex items-start gap-2.5">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Sparkles className="w-3 h-3 text-white" />
                      </div>
                      <div className="text-sm text-gray-200 leading-relaxed pt-0.5">
                        {msg.text}
                      </div>
                    </div>
                  )}

                  {/* Render actions for this message */}
                  {msg.actions?.map((action, actionIdx) => {
                    const isActive = isLatestAssistantMessage(idx) && !isLoading
                    const alreadyAnswered = msg.selectedOptions || msg.textInput

                    if (action.type === "DONE") return null

                    if (action.type === "OPTIONS") {
                      return (
                        <div key={actionIdx} className="grid grid-cols-2 gap-2 pl-8">
                          {action.params.map((option) => {
                            const isSelected = alreadyAnswered
                              ? msg.selectedOptions?.includes(option)
                              : selectedOptions.includes(option)
                            return (
                              <button
                                key={option}
                                onClick={() => isActive && !alreadyAnswered && handleOptionSelect(option)}
                                disabled={!isActive || !!alreadyAnswered}
                                className={cn(
                                  "p-3 rounded-xl border text-left text-sm transition-all duration-200",
                                  isSelected
                                    ? "border-orange-500/50 bg-orange-600/10 text-white ring-1 ring-orange-500/30"
                                    : alreadyAnswered
                                      ? "border-gray-800/40 bg-gray-900/30 text-gray-600 cursor-default"
                                      : "border-gray-800 bg-gray-900/50 text-gray-300 hover:border-gray-700 hover:bg-gray-900 cursor-pointer"
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  {isSelected && <Check className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />}
                                  <span className={isSelected ? "font-medium" : ""}>{option}</span>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )
                    }

                    if (action.type === "MULTI_SELECT") {
                      return (
                        <div key={actionIdx} className="space-y-2 pl-8">
                          <div className="grid grid-cols-2 gap-2">
                            {action.params.map((option) => {
                              const isSelected = alreadyAnswered
                                ? msg.selectedOptions?.includes(option)
                                : selectedOptions.includes(option)
                              return (
                                <button
                                  key={option}
                                  onClick={() => isActive && !alreadyAnswered && handleOptionSelect(option)}
                                  disabled={!isActive || !!alreadyAnswered}
                                  className={cn(
                                    "flex items-center gap-2.5 p-3 rounded-xl border text-left text-sm transition-all duration-200",
                                    isSelected
                                      ? "border-orange-500/50 bg-orange-600/10 ring-1 ring-orange-500/30"
                                      : alreadyAnswered
                                        ? "border-gray-800/40 bg-gray-900/30 text-gray-600 cursor-default"
                                        : "border-gray-800 bg-gray-900/50 hover:border-gray-700 hover:bg-gray-900 cursor-pointer"
                                  )}
                                >
                                  <div className={cn(
                                    "w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border",
                                    isSelected
                                      ? "bg-orange-500 border-orange-500 text-white"
                                      : "border-gray-600 bg-gray-800"
                                  )}>
                                    {isSelected && <Check className="w-3 h-3" />}
                                  </div>
                                  <span className={cn(isSelected ? "text-white font-medium" : "text-gray-300")}>
                                    {option}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                          {isActive && !alreadyAnswered && selectedOptions.length > 0 && (
                            <div className="flex justify-end">
                              <Button
                                size="sm"
                                onClick={handleSubmit}
                                className="bg-orange-600 hover:bg-orange-500 text-white text-xs"
                              >
                                Confirm ({selectedOptions.length})
                                <ArrowIcon className="w-3.5 h-3.5 ml-1" />
                              </Button>
                            </div>
                          )}
                        </div>
                      )
                    }

                    if (action.type === "FRAMEWORK") {
                      return (
                        <div key={actionIdx} className="space-y-2 pl-8">
                          {action.params.map((fw) => {
                            const isSelected = alreadyAnswered
                              ? msg.selectedOptions?.includes(fw)
                              : selectedOptions.includes(fw)
                            const label = frameworkLabels[fw] || fw
                            return (
                              <button
                                key={fw}
                                onClick={() => isActive && !alreadyAnswered && handleOptionSelect(fw)}
                                disabled={!isActive || !!alreadyAnswered}
                                className={cn(
                                  "w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all duration-200",
                                  isSelected
                                    ? "border-orange-500/50 bg-orange-600/10 ring-1 ring-orange-500/30"
                                    : alreadyAnswered
                                      ? "border-gray-800/40 bg-gray-900/30 text-gray-600 cursor-default"
                                      : "border-gray-800 bg-gray-900/50 hover:border-gray-700 hover:bg-gray-900 cursor-pointer"
                                )}
                              >
                                <div className={cn(
                                  "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0",
                                  isSelected ? "bg-orange-600/20 text-orange-400" : "bg-gray-800 text-gray-500"
                                )}>
                                  {fw === "nextjs" ? "N" : fw === "expo" ? "E" : "V"}
                                </div>
                                <div className="flex-1">
                                  <div className={cn("text-sm font-medium", isSelected ? "text-white" : "text-gray-300")}>
                                    {label}
                                  </div>
                                </div>
                                {isSelected && <Check className="w-4 h-4 text-orange-400" />}
                              </button>
                            )
                          })}
                        </div>
                      )
                    }

                    if (action.type === "TEXT_INPUT") {
                      return (
                        <div key={actionIdx} className="pl-8">
                          {alreadyAnswered ? (
                            <div className="rounded-xl border border-gray-800/40 bg-gray-900/30 px-4 py-3 text-sm text-gray-500 italic">
                              {msg.textInput}
                            </div>
                          ) : isActive ? (
                            <div className="space-y-2">
                              <textarea
                                value={textInput}
                                onChange={(e) => setTextInput(e.target.value)}
                                placeholder={action.params[0] || "Type your answer..."}
                                className="w-full min-h-[100px] max-h-[180px] resize-none rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-3 text-sm text-gray-100 placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-500/50 focus:border-orange-500/50 transition-colors"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && textInput.trim()) {
                                    handleSubmit()
                                  }
                                }}
                              />
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-600">Ctrl+Enter to send</span>
                                <Button
                                  size="sm"
                                  onClick={handleSubmit}
                                  disabled={!textInput.trim()}
                                  className="bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-30 disabled:cursor-not-allowed text-xs"
                                >
                                  <Send className="w-3.5 h-3.5 mr-1" />
                                  Send
                                </Button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )
                    }

                    return null
                  })}
                </div>
              )}
            </div>
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex items-start gap-2.5">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-3 h-3 text-white" />
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-800/60 flex items-center justify-between flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              handleReset()
              // Restart after reset
              setTimeout(() => {
                setHasStarted(true)
                callAI()
              }, 100)
            }}
            disabled={isLoading || messages.length === 0}
            className="text-gray-500 hover:text-gray-300 hover:bg-gray-800 text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            Start Over
          </Button>
          <span className="text-xs text-gray-600">
            Powered by AI
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Small arrow icon used in confirm button
function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  )
}
