"use client";

import { useState, useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import type { File as StorageFile } from '@/lib/storage-manager';
import {
  Code,
  Eye,
  Zap,
  FileText,
  Download,
  ExternalLink,
  RotateCcw,
  Play,
  Square,
  Terminal,
  Package,
  Trash2,
  Copy,
  Cloud,
  Edit3,
  Wand2,
  Rocket,
  GitBranch,
  MousePointerClick,
  Palette,
  MessageSquare,
  Globe,
  Share2,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Pause,
  FlaskConical,
  X as XIcon
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Workspace as Project } from "@/lib/storage-manager";
import { useIsMobile } from "@/hooks/use-mobile";
import { filterUnwantedFiles } from "@/lib/utils";
import { FileLookupService } from "@/lib/file-lookup-service";
import { compress } from 'lz4js'
import { zipSync, strToU8 } from 'fflate'
import { createClient } from "@/lib/supabase/client";
import {
  WebPreview,
  WebPreviewNavigation,
  WebPreviewNavigationButton,
  WebPreviewUrl,
  WebPreviewBody,
  WebPreviewConsole,
  WebPreviewDeviceSelector,
  DEVICE_PRESETS
} from "@/components/ai-elements/web-preview";
import {
  VisualEditorWrapper,
  VisualEditorToggle,
} from "./visual-editor-wrapper";
import { ChatSessionSelector } from "@/components/ui/chat-session-selector";
import type { StyleChange, Theme } from "@/lib/visual-editor";
import dynamic from "next/dynamic";

// Lazy-load Sandpack (heavy dependency) only when needed
const SandpackProviderLazy = dynamic(
  () => import("@codesandbox/sandpack-react").then(mod => ({ default: mod.SandpackProvider })),
  { ssr: false }
);
const SandpackPreviewLazy = dynamic(
  () => import("@codesandbox/sandpack-react").then(mod => ({ default: mod.SandpackPreview })),
  { ssr: false }
);

// Compress project files using LZ4 + Zip for efficient transfer
async function compressProjectFiles(
  projectFiles: any[],
  fileTree: string[],
  messagesToSend: any[],
  metadata: any
): Promise<ArrayBuffer> {
  console.log(`[Compression] Starting compression of ${projectFiles.length} files`)

  // Filter out images, videos, PDF files, scripts folders, test folders, and unwanted files to reduce payload size
  const filteredFiles = filterUnwantedFiles(projectFiles)
  console.log(`[Compression] Filtered to ${filteredFiles.length} files (removed ${projectFiles.length - filteredFiles.length} unwanted files)`)

  // Create zip file data
  const zipData: Record<string, Uint8Array> = {}

  // Add files to zip
  for (const file of filteredFiles) {
    if (file.path && file.content !== undefined) {
      zipData[file.path] = strToU8(String(file.content))
    }
  }

  // Add metadata file with file tree, messages, and other data
  const fullMetadata = {
    fileTree,
    messages: messagesToSend,
    ...metadata,
    compressedAt: new Date().toISOString(),
    fileCount: filteredFiles.length,
    originalFileCount: projectFiles.length,
    compressionType: 'lz4-zip'
  }
  zipData['__metadata__.json'] = strToU8(JSON.stringify(fullMetadata))

  // Create zip file
  const zippedData = zipSync(zipData)
  console.log(`[Compression] Created zip file: ${zippedData.length} bytes`)

  // Compress with LZ4
  const compressedData = await compress(zippedData)
  console.log(`[Compression] LZ4 compressed to: ${compressedData.length} bytes`)

  // Convert Uint8Array to ArrayBuffer
  const arrayBuffer = new ArrayBuffer(compressedData.length)
  new Uint8Array(arrayBuffer).set(compressedData)
  return arrayBuffer
}

interface CodePreviewPanelProps {
  project: Project | null;
  activeTab: "code" | "preview" | "cloud" | "audit";
  onTabChange: (tab: "code" | "preview" | "cloud" | "audit") => void;
  previewViewMode?: "desktop" | "mobile";
  syncedUrl?: string;
  onUrlChange?: (url: string) => void;
  onVisualEditorSave?: (changes: { elementId: string; changes: StyleChange[]; sourceFile?: string }) => Promise<boolean>;
  onApplyTheme?: (theme: Theme, cssContent: string) => Promise<boolean>;
  onTagToChat?: (component: { id: string; tagName: string; sourceFile?: string; sourceLine?: number; className: string; textContent?: string }) => void;
  onPublish?: () => void;
  isAIStreaming?: boolean;
  // Project files from parent - same source of truth as chat panel
  projectFiles?: any[];
  // Model selector props
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  userPlan?: string;
  subscriptionStatus?: string;
  // Chat session selector props
  userId?: string;
  currentSessionId?: string | null;
  onSessionChange?: (sessionId: string) => void;
  onNewSession?: () => void;
}

export interface CodePreviewPanelRef {
  createPreview: () => void;
  cleanupSandbox: () => void;
  openStackBlitz: () => void;
  refreshPreview: () => void;
  preview: PreviewState;
  isStackBlitzLoading: boolean;
  toggleVisualEditor: (enabled: boolean) => void;
  isVisualEditorEnabled: boolean;
}

interface PreviewState {
  sandboxId: string | null;
  url: string | null;
  isLoading: boolean;
  processId: string | null;
}

// Feature cards data for the rotating showcase
const FEATURE_CARDS = [
  {
    icon: MessageSquare,
    title: "AI Chat Commands",
    description: "Type / for slash commands, @ to reference files.",
    color: "from-blue-500/20 to-blue-600/10",
    accent: "text-orange-500",
    accentBg: "bg-orange-500",
  },
  {
    icon: MousePointerClick,
    title: "Visual Click-to-Edit",
    description: "Click any element in the preview to edit it live.",
    color: "from-orange-500/20 to-orange-600/10",
    accent: "text-orange-500",
    accentBg: "bg-orange-500",
  },
  {
    icon: RotateCcw,
    title: "Message Actions",
    description: "Hover messages to retry, revert, branch, or copy.",
    color: "from-amber-500/20 to-amber-600/10",
    accent: "text-amber-500",
    accentBg: "bg-amber-500",
  },
  {
    icon: GitBranch,
    title: "Branch & Revert",
    description: "Branch conversations and revert to any checkpoint.",
    color: "from-green-500/20 to-green-600/10",
    accent: "text-green-500",
    accentBg: "bg-green-500",
  },
  {
    icon: Rocket,
    title: "One-Click Deploy",
    description: "Deploy to Vercel, Netlify, or push to GitHub.",
    color: "from-orange-500/20 to-orange-600/10",
    accent: "text-orange-500",
    accentBg: "bg-orange-500",
  },
  {
    icon: Share2,
    title: "Project Actions",
    description: "Clone projects, publish & sell templates.",
    color: "from-orange-500/20 to-orange-600/10",
    accent: "text-orange-500",
    accentBg: "bg-orange-500",
  },
  {
    icon: Palette,
    title: "Theme & Typography",
    description: "Switch themes, 100+ Google Fonts, live preview.",
    color: "from-cyan-500/20 to-cyan-600/10",
    accent: "text-cyan-500",
    accentBg: "bg-cyan-500",
  },
]

// ── Animated Demo Components ─────────────────────────────────────────

function ChatCommandsDemo() {
  const [step, setStep] = useState(0)
  const commands = [
    { cmd: "/fix", desc: "Fix last error" },
    { cmd: "/deploy", desc: "Deploy to Vercel" },
    { cmd: "/branch", desc: "Branch conversation" },
    { cmd: "/refactor", desc: "Refactor code" },
  ]
  useEffect(() => {
    const t = setInterval(() => setStep(p => (p + 1) % 5), 900)
    return () => clearInterval(t)
  }, [])
  const typedText = step === 0 ? "/" : step <= 4 ? commands[step - 1]?.cmd || "/" : "/"
  return (
    <div className="space-y-2">
      {/* Fake input */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background/80 border border-gray-700/40">
        <span className="text-xs text-orange-500 font-mono">{typedText}</span>
        <span className="w-0.5 h-3.5 bg-orange-500 animate-pulse" />
      </div>
      {/* Dropdown */}
      <div className="rounded-lg bg-background/80 border border-gray-700/40 overflow-hidden">
        {commands.map((c, i) => (
          <div
            key={c.cmd}
            className={`flex items-center justify-between px-3 py-1.5 text-xs transition-all duration-300 ${
              i === (step > 0 ? step - 1 : 0) ? 'bg-orange-500/15' : ''
            }`}
          >
            <span className="font-mono font-medium text-orange-400">{c.cmd}</span>
            <span className="text-muted-foreground">{c.desc}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function VisualEditorDemo() {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setStep(p => (p + 1) % 4), 1100)
    return () => clearInterval(t)
  }, [])
  // Cursor positions for each step
  const cursorPos = [
    { left: '20%', top: '25%' },
    { left: '55%', top: '25%' },
    { left: '55%', top: '60%' },
    { left: '30%', top: '60%' },
  ]
  const selected = step
  return (
    <div className="relative h-[120px] rounded-lg bg-background/80 border border-gray-700/40 overflow-hidden">
      {/* Fake UI elements */}
      <div className="absolute top-3 left-3 right-[52%] h-7 rounded bg-muted/60 flex items-center px-2">
        <span className="text-[9px] text-muted-foreground">Header</span>
      </div>
      <div className="absolute top-3 left-[52%] right-3 h-7 rounded bg-muted/60 flex items-center px-2">
        <span className="text-[9px] text-muted-foreground">Nav</span>
      </div>
      <div className="absolute top-[44px] left-3 right-[52%] bottom-3 rounded bg-muted/40 flex items-center justify-center">
        <span className="text-[9px] text-muted-foreground">Card</span>
      </div>
      <div className="absolute top-[44px] left-[52%] right-3 bottom-3 rounded bg-muted/40 flex items-center justify-center">
        <span className="text-[9px] text-muted-foreground">Image</span>
      </div>
      {/* Selection ring */}
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={`absolute rounded transition-all duration-500 ${
            selected === i ? 'ring-2 ring-orange-500 ring-offset-1 ring-offset-transparent' : ''
          }`}
          style={{
            top: i < 2 ? '12px' : '44px',
            left: i % 2 === 0 ? '12px' : '52%',
            right: i % 2 === 0 ? '52%' : '12px',
            bottom: i < 2 ? 'auto' : '12px',
            height: i < 2 ? '28px' : undefined,
          }}
        />
      ))}
      {/* Animated cursor */}
      <div
        className="absolute w-4 h-4 transition-all duration-700 ease-in-out z-10"
        style={{ left: cursorPos[step].left, top: cursorPos[step].top }}
      >
        <MousePointerClick className="h-4 w-4 text-orange-500 drop-shadow-md" />
      </div>
      {/* Style panel slides in on select */}
      <div
        className={`absolute right-0 top-0 bottom-0 w-[72px] bg-background/95 border-l border-gray-700/40 transition-transform duration-500 flex flex-col gap-1 p-1.5 ${
          step >= 2 ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <span className="text-[8px] font-medium text-orange-400 px-1">Styles</span>
        <div className="h-2.5 w-full rounded bg-orange-500/20" />
        <div className="h-2.5 w-3/4 rounded bg-orange-500/15" />
        <div className="h-2.5 w-full rounded bg-orange-500/10" />
        <div className="flex gap-1 mt-1">
          <div className="w-3 h-3 rounded-full bg-orange-400" />
          <div className="w-3 h-3 rounded-full bg-orange-400" />
          <div className="w-3 h-3 rounded-full bg-blue-400" />
        </div>
      </div>
    </div>
  )
}

function MessageActionsDemo() {
  const [hovered, setHovered] = useState(false)
  const [activeBtn, setActiveBtn] = useState(-1)
  const actions = ["Retry", "Revert", "Branch", "Copy"]
  useEffect(() => {
    let step = 0
    const t = setInterval(() => {
      if (step === 0) { setHovered(true); setActiveBtn(-1) }
      else if (step <= 4) { setActiveBtn(step - 1) }
      else { setHovered(false); setActiveBtn(-1) }
      step = (step + 1) % 7
    }, 600)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="space-y-2">
      {/* Assistant message */}
      <div className="flex gap-2 items-start">
        <div className="w-5 h-5 rounded-full bg-muted flex-shrink-0 flex items-center justify-center">
          <Zap className="h-3 w-3 text-muted-foreground" />
        </div>
        <div className="flex-1 px-2.5 py-1.5 rounded-lg bg-muted/50 border border-gray-700/40/50">
          <div className="h-2 w-3/4 rounded bg-muted-foreground/15 mb-1" />
          <div className="h-2 w-1/2 rounded bg-muted-foreground/10" />
        </div>
      </div>
      {/* User message with action bar */}
      <div className="relative flex gap-2 items-start">
        <div className="w-5 h-5 rounded-full bg-orange-500/20 flex-shrink-0 flex items-center justify-center">
          <span className="text-[8px] font-bold text-orange-400">U</span>
        </div>
        <div className="flex-1 px-2.5 py-1.5 rounded-lg bg-orange-500/10 border border-blue-500/20">
          <div className="h-2 w-full rounded bg-blue-400/15 mb-1" />
          <div className="h-2 w-2/3 rounded bg-blue-400/10" />
        </div>
        {/* Floating action bar */}
        <div
          className={`absolute -top-6 right-0 flex gap-1 transition-all duration-300 ${
            hovered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
          }`}
        >
          {actions.map((a, i) => (
            <div
              key={a}
              className={`px-1.5 py-0.5 rounded text-[8px] font-medium border transition-all duration-200 ${
                activeBtn === i
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-400 scale-110'
                  : 'bg-background/80 border-border text-muted-foreground'
              }`}
            >
              {a}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function BranchRevertDemo() {
  const [activeCommit, setActiveCommit] = useState(0)
  const [showBranch, setShowBranch] = useState(false)
  useEffect(() => {
    let step = 0
    const t = setInterval(() => {
      if (step < 4) { setActiveCommit(step); setShowBranch(false) }
      else { setShowBranch(true) }
      step = (step + 1) % 6
    }, 700)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="flex gap-4 h-[110px] items-center justify-center">
      {/* Main branch line */}
      <div className="relative flex flex-col items-center gap-0">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full border-2 transition-all duration-300 ${
              i <= activeCommit
                ? 'border-green-500 bg-green-500/30 scale-110'
                : 'border-muted-foreground/30 bg-transparent'
            }`} />
            <span className={`text-[8px] w-12 transition-colors duration-300 ${
              i <= activeCommit ? 'text-green-400' : 'text-muted-foreground/50'
            }`}>
              {["init", "feat", "fix", "style"][i]}
            </span>
            {i < 3 && (
              <div className="absolute" style={{ left: '5px', top: `${14 + i * 26}px` }}>
                <div className={`w-0.5 h-[14px] transition-colors duration-300 ${
                  i < activeCommit ? 'bg-green-500/60' : 'bg-muted-foreground/20'
                }`} />
              </div>
            )}
          </div>
        ))}
      </div>
      {/* Branch fork */}
      <div className={`flex flex-col gap-1.5 transition-all duration-500 ${
        showBranch ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-3'
      }`}>
        <div className="text-[8px] text-green-400 font-medium">new-branch</div>
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-0.5 bg-green-500/40" />
          <div className="w-2.5 h-2.5 rounded-full border-2 border-green-400 bg-green-400/30" />
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-0.5 bg-green-500/30" />
          <div className="w-2.5 h-2.5 rounded-full border-2 border-green-400/60 bg-green-400/20" />
        </div>
      </div>
    </div>
  )
}

function DeployDemo() {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setStep(p => (p + 1) % 5), 900)
    return () => clearInterval(t)
  }, [])
  const progress = step === 0 ? 0 : step === 1 ? 30 : step === 2 ? 65 : step === 3 ? 100 : 100
  const done = step >= 3
  return (
    <div className="space-y-3">
      {/* Deploy button */}
      <div className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-all duration-500 ${
        done ? 'bg-green-500/15 border-green-500/30' : 'bg-orange-500/10 border-orange-500/20'
      }`}>
        {done ? (
          <><Globe className="h-3.5 w-3.5 text-green-500" /><span className="text-xs font-medium text-green-500">Deployed to Vercel</span></>
        ) : (
          <><Rocket className={`h-3.5 w-3.5 text-orange-500 ${step > 0 ? 'animate-bounce' : ''}`} /><span className="text-xs font-medium text-orange-400">{step === 0 ? 'Click to Deploy' : 'Deploying...'}</span></>
        )}
      </div>
      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${done ? 'bg-green-500' : 'bg-orange-500'}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      {/* Log lines */}
      <div className="space-y-1">
        {["Building production bundle...", "Optimizing assets...", "Uploading to CDN...", "Live at your-app.vercel.app"].map((log, i) => (
          <div
            key={i}
            className={`text-[9px] font-mono transition-all duration-300 ${
              i < step ? 'opacity-100 text-muted-foreground' : i === step ? 'opacity-100 text-orange-400' : 'opacity-0'
            }`}
          >
            {i < step ? '  ' : i === step ? '> ' : '  '}{log}
          </div>
        ))}
      </div>
    </div>
  )
}

function ProjectActionsDemo() {
  const [hovered, setHovered] = useState(false)
  const [activeBtn, setActiveBtn] = useState(-1)
  useEffect(() => {
    let step = 0
    const t = setInterval(() => {
      if (step === 0) { setHovered(true); setActiveBtn(-1) }
      else if (step <= 3) setActiveBtn(step - 1)
      else { setHovered(false); setActiveBtn(-1) }
      step = (step + 1) % 6
    }, 700)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="relative rounded-lg bg-background/80 border border-gray-700/40 overflow-hidden h-[110px]">
      {/* Fake project card */}
      <div className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500/30 to-orange-600/30 flex items-center justify-center">
            <Code className="h-4 w-4 text-orange-400" />
          </div>
          <div>
            <div className="h-2.5 w-20 rounded bg-foreground/15" />
            <div className="h-2 w-14 rounded bg-muted-foreground/10 mt-1" />
          </div>
        </div>
        <div className="h-2 w-full rounded bg-muted/60 mb-1" />
        <div className="h-2 w-3/4 rounded bg-muted/40" />
      </div>
      {/* Hover action buttons */}
      <div className={`absolute top-2 right-2 flex gap-1 transition-all duration-300 ${
        hovered ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
      }`}>
        {[
          { label: "Clone", color: "bg-orange-500/80" },
          { label: "Publish", color: "bg-green-500/80" },
          { label: "Delete", color: "bg-red-500/80" },
        ].map((btn, i) => (
          <div
            key={btn.label}
            className={`w-6 h-6 rounded-md flex items-center justify-center transition-all duration-200 ${btn.color} ${
              activeBtn === i ? 'scale-125 ring-2 ring-white/30' : 'scale-100'
            }`}
          >
            <span className="text-[7px] text-white font-bold">{btn.label[0]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ThemeTypographyDemo() {
  const [step, setStep] = useState(0)
  const themes = [
    { bg: "bg-slate-900", fg: "text-white", accent: "bg-orange-500", name: "Dark" },
    { bg: "bg-white", fg: "text-slate-900", accent: "bg-violet-500", name: "Light" },
    { bg: "bg-emerald-950", fg: "text-emerald-100", accent: "bg-emerald-500", name: "Forest" },
    { bg: "bg-orange-50", fg: "text-orange-900", accent: "bg-orange-500", name: "Warm" },
  ]
  const fonts = ["font-sans", "font-serif", "font-mono", "font-sans"]
  useEffect(() => {
    const t = setInterval(() => setStep(p => (p + 1) % themes.length), 1200)
    return () => clearInterval(t)
  }, [])
  const theme = themes[step]
  return (
    <div className="space-y-2">
      {/* Mini preview switching themes */}
      <div className={`rounded-lg p-3 transition-all duration-700 ${theme.bg} border border-gray-700/40/30`}>
        <div className={`text-sm font-bold ${theme.fg} ${fonts[step]} transition-all duration-500 mb-1`}>
          Hello World
        </div>
        <div className={`text-[10px] ${theme.fg} opacity-60 ${fonts[step]} transition-all duration-500 mb-2`}>
          The quick brown fox jumps over the lazy dog
        </div>
        <div className="flex gap-1.5">
          <div className={`h-5 px-2 rounded text-[8px] font-medium flex items-center ${theme.accent} text-white transition-all duration-500`}>
            Button
          </div>
          <div className={`h-5 px-2 rounded text-[8px] font-medium flex items-center border border-current ${theme.fg} opacity-40 transition-all duration-500`}>
            Outline
          </div>
        </div>
      </div>
      {/* Theme swatches */}
      <div className="flex items-center justify-between">
        {themes.map((t, i) => (
          <div key={i} className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md transition-all duration-300 ${
            i === step ? 'bg-muted ring-1 ring-orange-500/40' : ''
          }`}>
            <div className={`w-3 h-3 rounded-full ${t.accent} transition-transform duration-300 ${i === step ? 'scale-125' : ''}`} />
            <span className="text-[8px] text-muted-foreground">{t.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const CARD_DEMOS = [
  ChatCommandsDemo,
  VisualEditorDemo,
  MessageActionsDemo,
  BranchRevertDemo,
  DeployDemo,
  ProjectActionsDemo,
  ThemeTypographyDemo,
]

// ── AI Responding View ───────────────────────────────────────────────

function getWittyMessages(projectName?: string) {
  const name = projectName || "your app"

  return [
    // Project-specific
    `Making ${name} the best thing on the internet...`,
    `${name} is about to level up...`,
    `Giving ${name} that pixel-perfect touch...`,
    `${name} deserves this glow-up...`,
    `Crafting the next version of ${name}...`,
    `${name} won't know what hit it...`,
    `Pouring love into every line of ${name}...`,
    `${name} is getting the VIP treatment...`,
    `Plotting world domination for ${name}...`,
    `${name}'s users are going to love this...`,

    // Hans the mentor
    "Channeling Hans's wisdom on this one...",
    "Hans would approve of this approach...",
    "Running it by Hans in my head... yep, looks good.",
    "Hans didn't build PiPilot for us to write ugly code...",
    "WWHD - What Would Hans Do?",
    "Hans says ship it, so we ship it.",
    "Learning from the best... thanks Hans.",
    "Hans's vision, AI's execution...",
    "Somewhere, Hans is nodding approvingly...",
    "Built different, just like Hans intended.",

    // Dev humor
    "Teaching pixels to dance...",
    "Convincing the code to cooperate...",
    "Negotiating with the semicolons...",
    "Asking the divs to align nicely...",
    "Refactoring reality, one line at a time...",
    "Calculating the meaning of null...",
    "Whispering sweet nothings to the compiler...",
    "Untangling the spaghetti before you see it...",
    "Ctrl+Z won't undo how good this is about to be...",
    "The bugs never stood a chance...",
    "Reticulating splines, obviously...",
    "Stacking divs like a pro...",
    "Generating code that even linters love...",
    "Almost there... jk, still working on it...",
    "Zero bugs detected so far... fingers crossed...",

    // Motivational
    "Great things take a few seconds...",
    "Your future users will thank you for waiting...",
    "This is going to look amazing, trust me...",
    "Making the internet a slightly better place...",
    "Building Rome, but faster...",
    "Hot-reloading brilliance...",
    "PiPilot is cooking something special...",
    "Deploying creativity at scale...",
    "Writing code so clean it sparkles...",
    "If code grew on trees, we'd still do it faster...",
  ]
}

function AIRespondingView({ projectName }: { projectName?: string }) {
  const messages = getWittyMessages(projectName)
  const [messageIndex, setMessageIndex] = useState(() =>
    Math.floor(Math.random() * messages.length)
  )
  const [fade, setFade] = useState(true)
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false)
      setTimeout(() => {
        setMessageIndex(prev => {
          let next = prev
          while (next === prev) {
            next = Math.floor(Math.random() * messagesRef.current.length)
          }
          return next
        })
        setFade(true)
      }, 300)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Rocket GIF background */}
      <img
        src="https://pipilot.dev/assets/pipilot_rocket_cruise.gif"
        alt="AI is working"
        className="absolute inset-0 w-full h-full object-cover"
      />
      {/* Bottom overlay with witty message */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent pt-20 pb-8 px-6">
        <div className="text-center max-w-md mx-auto">
          {/* Pulsing dots */}
          <div className="flex items-center justify-center gap-1.5 mb-4">
            <div className="w-2 h-2 rounded-full bg-white/80 animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 rounded-full bg-white/80 animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 rounded-full bg-white/80 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2 drop-shadow-md">
            AI is working its magic
          </h3>
          <p
            className={`text-white/80 text-sm drop-shadow-sm transition-opacity duration-300 ${
              fade ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {messagesRef.current[messageIndex]}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── PreviewEmptyState ────────────────────────────────────────────────

function PreviewEmptyState({ projectName, onStartPreview, disabled }: {
  projectName?: string;
  onStartPreview: () => void;
  disabled: boolean;
}) {
  const [activeCard, setActiveCard] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)

  // Auto-rotate cards
  useEffect(() => {
    if (!isPlaying) return
    const interval = setInterval(() => {
      setActiveCard(prev => (prev + 1) % FEATURE_CARDS.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [isPlaying])

  const goPrev = () => setActiveCard(prev => (prev - 1 + FEATURE_CARDS.length) % FEATURE_CARDS.length)
  const goNext = () => setActiveCard(prev => (prev + 1) % FEATURE_CARDS.length)

  const card = FEATURE_CARDS[activeCard]
  const CardIcon = card.icon
  const DemoComponent = CARD_DEMOS[activeCard]

  return (
    <div className="h-full flex flex-col items-center justify-center p-4 sm:p-6 bg-gradient-to-b from-gray-950 to-gray-900/50 overflow-y-auto">
      <div className="w-full max-w-lg">
        {/* Card row: dots | card | nav buttons */}
        <div className="flex items-center gap-3 mb-6">
          {/* Left: vertical dot indicators */}
          <div className="hidden sm:flex flex-col items-center gap-1.5 py-2">
            {FEATURE_CARDS.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveCard(i)}
                className={`rounded-full transition-all duration-300 ${
                  i === activeCard
                    ? 'w-2 h-5 bg-orange-500'
                    : 'w-2 h-2 bg-muted-foreground/25 hover:bg-muted-foreground/50'
                }`}
              />
            ))}
          </div>

          {/* Center: feature card */}
          <div className="flex-1 min-w-0">
            <div
              className={`rounded-2xl border border-gray-700/40 bg-gradient-to-br ${card.color} shadow-lg overflow-hidden transition-all duration-500`}
            >
              {/* Card header */}
              <div className="px-5 pt-4 pb-2 flex items-start gap-3">
                <div className={`p-2 rounded-xl bg-background/80 shadow-sm ${card.accent}`}>
                  <CardIcon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-sm leading-tight">{card.title}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                    {card.description}
                  </p>
                </div>
              </div>

              {/* Animated demo area */}
              <div className="px-4 pb-4">
                <DemoComponent key={activeCard} />
              </div>
            </div>
          </div>

          {/* Right: prev / play-pause / next buttons */}
          <div className="hidden sm:flex flex-col items-center gap-1.5">
            <button
              onClick={goPrev}
              className="w-8 h-8 rounded-full border border-gray-700/60 bg-gray-900 hover:bg-gray-800 flex items-center justify-center transition-colors shadow-sm"
            >
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-8 h-8 rounded-full border border-gray-700/60 bg-gray-900 hover:bg-gray-800 flex items-center justify-center transition-colors shadow-sm"
            >
              {isPlaying ? (
                <Pause className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <Play className="h-3.5 w-3.5 text-muted-foreground ml-0.5" />
              )}
            </button>
            <button
              onClick={goNext}
              className="w-8 h-8 rounded-full border border-gray-700/60 bg-gray-900 hover:bg-gray-800 flex items-center justify-center transition-colors shadow-sm"
            >
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Mobile: horizontal dots + nav */}
        <div className="flex sm:hidden items-center justify-center gap-3 mb-5">
          <button onClick={goPrev} className="w-7 h-7 rounded-full border border-gray-700/60 bg-gray-900 hover:bg-gray-800 flex items-center justify-center">
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-1.5">
            {FEATURE_CARDS.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveCard(i)}
                className={`rounded-full transition-all duration-300 ${
                  i === activeCard ? 'w-5 h-1.5 bg-orange-500' : 'w-1.5 h-1.5 bg-muted-foreground/25'
                }`}
              />
            ))}
          </div>
          <button onClick={() => setIsPlaying(!isPlaying)} className="w-7 h-7 rounded-full border border-gray-700/60 bg-gray-900 hover:bg-gray-800 flex items-center justify-center">
            {isPlaying ? <Pause className="h-3 w-3 text-muted-foreground" /> : <Play className="h-3 w-3 text-muted-foreground ml-0.5" />}
          </button>
          <button onClick={goNext} className="w-7 h-7 rounded-full border border-gray-700/60 bg-gray-900 hover:bg-gray-800 flex items-center justify-center">
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>

        {/* Title + CTA */}
        <div className="text-center">
          <h3 className="text-xl font-semibold mb-1">PiPilot Preview</h3>
          <p className="text-muted-foreground text-sm mb-5">
            {projectName
              ? `Launch "${projectName}" to see it live`
              : "Build, preview, and deploy your app -- all in one place"
            }
          </p>

          <Button
            onClick={onStartPreview}
            disabled={disabled}
            size="lg"
            className="rounded-full px-8 shadow-md"
          >
            <Play className="h-4 w-4 mr-2" />
            Start Preview
          </Button>
        </div>
      </div>
    </div>
  )
}

export const CodePreviewPanel = forwardRef<CodePreviewPanelRef, CodePreviewPanelProps>(
  ({ project, activeTab, onTabChange, previewViewMode = "desktop", syncedUrl, onUrlChange, onVisualEditorSave, onApplyTheme, onTagToChat, onPublish, isAIStreaming = false, projectFiles: parentProjectFiles, selectedModel, onModelChange, userPlan, subscriptionStatus, userId, currentSessionId, onSessionChange, onNewSession }, ref) => {
    const { toast } = useToast();
    const isMobile = useIsMobile();
    const [preview, setPreview] = useState<PreviewState>({
      sandboxId: null,
      url: null,
    isLoading: false,
    processId: null,
  })
  const [customUrl, setCustomUrl] = useState("")
  const [currentLog, setCurrentLog] = useState("Initializing preview...")
  const [rocketPhase, setRocketPhase] = useState<'cruising' | 'landing'>('cruising')
  const [isExporting, setIsExporting] = useState(false)
  const [consoleOutput, setConsoleOutput] = useState<string[]>([])
  const [isConsoleOpen, setIsConsoleOpen] = useState(false)
  const [streamReader, setStreamReader] = useState<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const consoleRef = useRef<HTMLDivElement>(null)
  const [activeConsoleTab, setActiveConsoleTab] = useState<'console'>('console')
  const [consoleHeight, setConsoleHeight] = useState(300) // Default height in pixels
  const [isResizing, setIsResizing] = useState(false)
  const resizeRef = useRef<HTMLDivElement>(null)
  const [browserLogs, setBrowserLogs] = useState<string[]>([])
  const [isExpoProject, setIsExpoProject] = useState(false)
  const [isViteProject, setIsViteProject] = useState(false)
  const [showSandpackPreview, setShowSandpackPreview] = useState(false)
  const [sandpackFiles, setSandpackFiles] = useState<Record<string, { code: string }> | null>(null)
  const [sandpackDeps, setSandpackDeps] = useState<Record<string, string>>({})
  const [sandpackEntry, setSandpackEntry] = useState<string>('/src/index.tsx')
  const [sandpackLoading, setSandpackLoading] = useState(false)
  const browserLogsRef = useRef<HTMLDivElement>(null)
  const [isStackBlitzOpen, setIsStackBlitzOpen] = useState(false)
  const [backgroundProcess, setBackgroundProcess] = useState<{
    pid: number | null
    command: string | null
    isRunning: boolean
    logInterval?: NodeJS.Timeout
  }>({ pid: null, command: null, isRunning: false })
  const [processLogs, setProcessLogs] = useState<string[]>([])
  const processLogsRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  
  // FileLookupService - same source of truth as chat panel
  const fileLookupServiceRef = useRef<FileLookupService | null>(null)
  if (!fileLookupServiceRef.current) {
    fileLookupServiceRef.current = new FileLookupService()
  }

  // Visual Editor state
  const [isVisualEditorEnabled, setIsVisualEditorEnabled] = useState(false)
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null)

  // Dispatch preview state changes to parent component + save preview URL locally
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('preview-state-changed', {
        detail: { preview }
      }))
    }
    // Persist preview URL to workspace so it loads instantly on next tab switch
    if (preview.url && project?.id && !preview.isLoading) {
      import('@/lib/storage-manager').then(({ storageManager }) => {
        storageManager.init().then(() => {
          storageManager.updateWorkspace(project.id, { previewUrl: preview.url! })
        })
      }).catch(() => {})
    }
  }, [preview])

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    createPreview,
    cleanupSandbox,
    openStackBlitz,
    refreshPreview,
    preview,
    isStackBlitzLoading: isStackBlitzOpen,
    toggleVisualEditor: setIsVisualEditorEnabled,
    isVisualEditorEnabled,
  }), [preview, isStackBlitzOpen, isVisualEditorEnabled])

  // Unified console logging function - combines all log types
  const addConsoleLog = (message: string, type: 'terminal' | 'browser' | 'process' | 'server' = 'terminal') => {
    const timestamp = new Date().toLocaleTimeString()
    const typeIcon = {
      terminal: '💻',
      browser: '🌐',
      process: '⚙️',
      server: '🚀'
    }[type]
    const typeLabel = {
      terminal: 'TERMINAL',
      browser: 'BROWSER',
      process: 'PROCESS',
      server: 'SERVER'
    }[type]

    setConsoleOutput(prev => [...prev, `[${timestamp}] ${typeIcon} [${typeLabel}] ${message}`])

    // Update currentLog with server messages when preview is loading or recently ready
    if (type === 'server' && (preview.isLoading || (preview.url && !preview.isLoading))) {
      setCurrentLog(message)
    }
  }

  // Detect if project is Expo
  useEffect(() => {
    if (!project) {
      setIsExpoProject(false)
      setIsViteProject(false)
      setShowSandpackPreview(false)
      return
    }

    const checkProjectFramework = async () => {
      try {
        const { storageManager } = await import('@/lib/storage-manager')
        const files = await storageManager.getFiles(project.id)

        // Check Expo: app.json or app.config.js or expo in dependencies
        const hasExpoConfig = files.some((f: StorageFile) => f.path === 'app.json' || f.path === 'app.config.js')
        const packageJsonFile = files.find((f: StorageFile) => f.path === 'package.json')
        let packageJson: any = null
        if (packageJsonFile) {
          try { packageJson = JSON.parse(packageJsonFile.content) } catch {}
        }

        if (hasExpoConfig || packageJson?.dependencies?.expo || packageJson?.devDependencies?.expo) {
          setIsExpoProject(true)
          setIsViteProject(false)
          return
        }
        setIsExpoProject(false)

        // Check Vite: vite.config.ts/js/mjs or vite in devDependencies
        const hasViteConfig = files.some((f: StorageFile) =>
          f.path === 'vite.config.ts' || f.path === 'vite.config.js' || f.path === 'vite.config.mjs'
        )
        const hasViteDep = !!(packageJson?.devDependencies?.vite || packageJson?.dependencies?.vite)
        setIsViteProject(hasViteConfig || hasViteDep)
      } catch (error) {
        console.error('Error checking project framework:', error)
        setIsExpoProject(false)
        setIsViteProject(false)
      }
    }

    checkProjectFramework()
  }, [project])

  // Auto-load preview URL from project slug on preview tab switch
  // Projects already have a slug field - use it to construct the preview URL directly
  useEffect(() => {
    if (
      activeTab === 'preview' &&
      isViteProject &&
      !isExpoProject &&
      project?.id &&
      project?.slug &&
      !preview.url &&
      !preview.isLoading
    ) {
      const previewUrl = `https://${project.slug}.pipilot.dev/`
      console.log('[CodePreviewPanel] Constructed preview URL from project slug:', previewUrl)
      setPreview(prev => ({ ...prev, url: previewUrl }))
    }
  }, [activeTab, isViteProject, isExpoProject, project?.id, project?.slug, preview.url, preview.isLoading])

  // Track if files have changed since last preview was created
  const filesChangedSincePreviewRef = useRef(false)
  const lastPreviewFilesHashRef = useRef<string | null>(null)

  // Listen for file changes and mark preview as needing refresh
  useEffect(() => {
    if (!project) return

    const handleFilesChanged = (e: CustomEvent) => {
      const detail = e.detail as { projectId: string }
      if (detail.projectId === project.id) {
        console.log('[CodePreviewPanel] Files changed for project:', project.id)
        filesChangedSincePreviewRef.current = true

        // If we have an active preview, show a toast suggesting refresh
        if (preview.url && !preview.isLoading) {
          // Dispatch event to notify that preview may be stale
          window.dispatchEvent(new CustomEvent('preview-files-changed', {
            detail: { projectId: project.id }
          }))
        }
      }
    }

    window.addEventListener('files-changed', handleFilesChanged as EventListener)
    return () => window.removeEventListener('files-changed', handleFilesChanged as EventListener)
  }, [project, preview.url, preview.isLoading])

  // Initialize FileLookupService when project changes (same pattern as chat-panel-v2)
  useEffect(() => {
    if (!project?.id || !fileLookupServiceRef.current) return
    fileLookupServiceRef.current.initialize(project.id)
  }, [project?.id])

  // Auto-refresh preview when AI streaming ends if files have changed
  useEffect(() => {
    // When AI streaming ends and files have changed, refresh the preview
    if (!isAIStreaming && filesChangedSincePreviewRef.current && preview.url && !preview.isLoading) {
      console.log('[CodePreviewPanel] AI streaming ended, files changed - auto-refreshing preview')
      // Use a longer delay (1500ms) to ensure all file writes to IndexedDB are
      // fully committed before we fetch them. Users reported that auto-refreshed
      // previews showed stale file states from before the stream.
      const timeoutId = setTimeout(() => {
        if (filesChangedSincePreviewRef.current) {
          refreshPreviewWithLatestFiles()
        }
      }, 1500)
      return () => clearTimeout(timeoutId)
    }
  }, [isAIStreaming])

  useEffect(() => {
    if (preview.url) {
      setCustomUrl(preview.url)
      // Dispatch URL change event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('preview-url-changed', { 
          detail: { url: preview.url } 
        }))
      }
    }
  }, [preview.url])

  // Auto-scroll console to bottom when new output arrives
  useEffect(() => {
    if (consoleRef.current && isConsoleOpen) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight
    }
  }, [consoleOutput, browserLogs, processLogs, isConsoleOpen])

  // Set up iframe message listener for browser logs
  useEffect(() => {
    const handleIframeMessage = (event: MessageEvent) => {
      // Accept messages from preview iframe or any pipilot.dev subdomain (for cross-origin iframes)
      const iframe = document.querySelector('#preview-iframe') as HTMLIFrameElement
      const isFromIframe = iframe && event.source === iframe.contentWindow
      const isFromPipilotDomain = typeof event.origin === 'string' && (
        event.origin.includes('pipilot.dev') ||
        event.origin.includes('pipilot.app') ||
        event.origin.includes('e2b.app') ||
        event.origin.includes('localhost') ||
        event.origin.includes('127.0.0.1')
      )

      // Only process if from our iframe or a trusted domain
      if (!isFromIframe && !isFromPipilotDomain) {
        return
      }

      // Handle legacy console messages
      if (event.data?.type === 'console') {
        // Only add to browserLogs for the Browser tab (legacy format)
        const level = event.data.level || 'log'
        setBrowserLogs(prev => [...prev, JSON.stringify({
          method: level,
          data: [{ type: 'string', value: event.data.message }],
          timestamp: new Date().toISOString(),
          id: `legacy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        })])
      }

      // Handle BROWSER_CONSOLE_LOG from console bridge (both formats)
      if (event.data?.type === 'BROWSER_CONSOLE_LOG' && event.data?.payload) {
        const { method, data, timestamp, id } = event.data.payload

        // Add to browserLogs for the Browser tab (console-feed format)
        // Normalize the data to console-feed format
        const normalizedData = Array.isArray(data)
          ? data.map((arg: any) => {
              if (arg && typeof arg === 'object' && arg.__isError) {
                return { type: 'error', value: { name: arg.name, message: arg.message, stack: arg.stack } }
              }
              if (arg && typeof arg === 'object' && 'type' in arg && 'value' in arg) {
                return arg // Already in correct format
              }
              if (typeof arg === 'object' && arg !== null) {
                return { type: 'object', value: arg }
              }
              return { type: typeof arg, value: arg }
            })
          : [{ type: typeof data, value: data }]

        setBrowserLogs(prev => [...prev, JSON.stringify({
          method: method || 'log',
          data: normalizedData,
          timestamp: timestamp || new Date().toISOString(),
          id: id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        })])
      }
    }

    window.addEventListener('message', handleIframeMessage)
    return () => window.removeEventListener('message', handleIframeMessage)
  }, [])

  // Add a listener for console interceptor injection requests
  useEffect(() => {
    const handleInterceptorRequest = (event: MessageEvent) => {
      const iframe = document.querySelector('#preview-iframe') as HTMLIFrameElement
      if (iframe && event.source === iframe.contentWindow && event.data.type === 'inject-console-interceptor') {
        try {
          // The iframe is requesting the console interceptor script
          iframe.contentWindow?.postMessage({
            type: 'console-interceptor-script',
            script: `
              (function() {
                const originalConsole = {
                  log: console.log,
                  error: console.error,
                  warn: console.warn,
                  info: console.info
                };

                // Intercept console methods
                console.log = function(...args) {
                  originalConsole.log.apply(console, args);
                  window.parent.postMessage({
                    type: 'console',
                    level: 'log',
                    message: args.map(arg => 
                      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
                    ).join(' ')
                  }, '*');
                };

                console.error = function(...args) {
                  originalConsole.error.apply(console, args);
                  window.parent.postMessage({
                    type: 'console',
                    level: 'error',
                    message: args.map(arg => 
                      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
                    ).join(' ')
                  }, '*');
                };

                console.warn = function(...args) {
                  originalConsole.warn.apply(console, args);
                  window.parent.postMessage({
                    type: 'console',
                    level: 'warn',
                    message: args.map(arg => 
                      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
                    ).join(' ')
                  }, '*');
                };

                console.info = function(...args) {
                  originalConsole.info.apply(console, args);
                  window.parent.postMessage({
                    type: 'console',
                    level: 'info',
                    message: args.map(arg => 
                      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
                    ).join(' ')
                  }, '*');
                };

                // Intercept unhandled errors
                window.addEventListener('error', function(event) {
                  window.parent.postMessage({
                    type: 'console',
                    level: 'error',
                    message: 'Unhandled Error: ' + event.message + ' at ' + event.filename + ':' + event.lineno
                  }, '*');
                });

                // Intercept unhandled promise rejections
                window.addEventListener('unhandledrejection', function(event) {
                  window.parent.postMessage({
                    type: 'console',
                    level: 'error',
                    message: 'Unhandled Promise Rejection: ' + event.reason
                  }, '*');
                });

                // Send initial message to confirm interceptor is loaded
                window.parent.postMessage({
                  type: 'console',
                  level: 'info',
                  message: 'Console interceptor loaded'
                }, '*');
              })();
            `
          }, '*')
        } catch (error) {
          console.warn('Failed to send console interceptor script:', error)
        }
      }
    }

    window.addEventListener('message', handleInterceptorRequest)
    return () => window.removeEventListener('message', handleInterceptorRequest)
  }, [])

  // Set up keyboard shortcuts for console
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && isConsoleOpen && event.key === '1') {
        event.preventDefault()
        // Console is already the only tab, no need to change
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isConsoleOpen])

  // Inject console interceptor script into iframe when it loads
  const injectConsoleInterceptor = (iframe: HTMLIFrameElement) => {
    iframe.addEventListener('load', () => {
      try {
        // Wait a bit for the iframe to fully load
        setTimeout(() => {
          try {
            const script = `
              (function() {
                const originalConsole = {
                  log: console.log,
                  error: console.error,
                  warn: console.warn,
                  info: console.info
                };

                // Intercept console methods
                console.log = function(...args) {
                  originalConsole.log.apply(console, args);
                  window.parent.postMessage({
                    type: 'console',
                    level: 'log',
                    message: args.map(arg => 
                      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
                    ).join(' ')
                  }, '*');
                };

                console.error = function(...args) {
                  originalConsole.error.apply(console, args);
                  window.parent.postMessage({
                    type: 'console',
                    level: 'error',
                    message: args.map(arg => 
                      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
                    ).join(' ')
                  }, '*');
                };

                console.warn = function(...args) {
                  originalConsole.warn.apply(console, args);
                  window.parent.postMessage({
                    type: 'console',
                    level: 'warn',
                    message: args.map(arg => 
                      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
                    ).join(' ')
                  }, '*');
                };

                console.info = function(...args) {
                  originalConsole.info.apply(console, args);
                  window.parent.postMessage({
                    type: 'console',
                    level: 'info',
                    message: args.map(arg => 
                      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
                    ).join(' ')
                  }, '*');
                };

                // Intercept unhandled errors
                window.addEventListener('error', function(event) {
                  window.parent.postMessage({
                    type: 'console',
                    level: 'error',
                    message: 'Unhandled Error: ' + event.message + ' at ' + event.filename + ':' + event.lineno
                  }, '*');
                });

                // Intercept unhandled promise rejections
                window.addEventListener('unhandledrejection', function(event) {
                  window.parent.postMessage({
                    type: 'console',
                    level: 'error',
                    message: 'Unhandled Promise Rejection: ' + event.reason
                  }, '*');
                });

                // Send initial message to confirm interceptor is loaded
                window.parent.postMessage({
                  type: 'console',
                  level: 'info',
                  message: 'Console interceptor loaded'
                }, '*');
              })();
            `;
            
            // Try multiple methods to inject the script
            try {
              // Method 1: Direct script injection
              const scriptElement = iframe.contentDocument?.createElement('script')
              if (scriptElement && iframe.contentDocument?.head) {
                scriptElement.textContent = script
                iframe.contentDocument.head.appendChild(scriptElement)
                console.log('Console interceptor injected via script element')
              } else {
                throw new Error('Cannot access iframe contentDocument')
              }
            } catch (scriptError) {
              console.warn('Script element injection failed, trying eval method:', scriptError)
              
              // Method 2: Try eval (may be blocked by sandbox)
              try {
                (iframe.contentWindow as any)?.eval(script)
                console.log('Console interceptor injected via eval')
              } catch (evalError) {
                console.warn('Eval injection failed, trying postMessage method:', evalError)
                
                // Method 3: PostMessage to iframe (requires iframe to listen)
                iframe.contentWindow?.postMessage({
                  type: 'inject-console-interceptor',
                  script: script
                }, '*')
                console.log('Console interceptor sent via postMessage')
              }
            }
          } catch (error) {
            console.warn('Failed to inject console interceptor:', error);
          }
        }, 1000) // Wait 1 second for iframe to fully load
      } catch (error) {
        console.warn('Failed to set up console interceptor:', error);
      }
    });
  };

  // Cleanup sandbox, stream, background process, log interval, and EventSource on unmount only
  useEffect(() => {
    return () => {
      if (preview.sandboxId) {
        cleanupSandbox()
      }
      // Close stream reader if it exists
      if (streamReader) {
        streamReader.cancel()
      }
      // Close EventSource if it exists
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      // Stop background process if running
      if (backgroundProcess.isRunning && backgroundProcess.pid) {
        stopBackgroundProcess()
      }
      // Clear log interval if it exists
      if (backgroundProcess.logInterval) {
        clearInterval(backgroundProcess.logInterval)
      }
    }
  }, []) // Empty dependency array - only run on unmount

  const createPreview = async () => {
    if (!project) return

    // Reset the files changed flag since we're creating a fresh preview
    filesChangedSincePreviewRef.current = false

    const loadingPreview = { ...preview, isLoading: true }
    setPreview(loadingPreview)
    setCurrentLog("Booting VM...")
    setRocketPhase('cruising') // Start with cruise rocket
    setConsoleOutput([]) // Clear previous console output
    
    // Dispatch preview starting event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('preview-starting', { 
        detail: { preview: loadingPreview } 
      }))
    }
    
    // Close any existing stream
    if (streamReader) {
      streamReader.cancel()
      setStreamReader(null)
    }

    try {
      // Get current user for auth information
      const supabase = createClient()
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      
      if (userError || !user) {
        throw new Error('Authentication required. Please sign in to create previews.')
      }

      const authUserId = user.id
      const authUsername = user.user_metadata?.full_name || user.email?.split('@')[0] || 'anonymous'
      // Use FileLookupService as primary source - same as chat-panel-v2
      // This auto-refreshes on files-changed events, ensuring latest AI edits are included
      let files: any[]
      try {
        if (fileLookupServiceRef.current && project.id) {
          await fileLookupServiceRef.current.initialize(project.id)
          await fileLookupServiceRef.current.refreshFiles()
          files = (fileLookupServiceRef.current as any)['files'] || []
          console.log(`[CodePreviewPanel] Loaded ${files.length} files via FileLookupService (same source as chat panel)`)
        } else {
          files = []
        }
      } catch (error) {
        console.error('[CodePreviewPanel] FileLookupService failed:', error)
        files = []
      }

      // Fallback to parent prop or storageManager if FileLookupService returned nothing
      if (!files || files.length === 0) {
        if (parentProjectFiles && parentProjectFiles.length > 0) {
          files = parentProjectFiles
          console.log(`[CodePreviewPanel] Fallback to parent projectFiles: ${files.length} files`)
        } else {
          const { storageManager } = await import('@/lib/storage-manager')
          await storageManager.init()
          await new Promise(resolve => setTimeout(resolve, 200))
          files = await storageManager.getFiles(project.id)
          console.log(`[CodePreviewPanel] Fallback to storageManager: ${files?.length || 0} files`)
        }
      }

      if (!files || files.length === 0) {
        throw new Error('No files found in project')
      }

      // Filter out images, videos, PDF files, scripts folders, test folders, and unwanted files to reduce payload size
      const filteredFiles = filterUnwantedFiles(files)
      console.log(`[CodePreviewPanel] Filtered files for preview: ${filteredFiles.length} of ${files.length} (removed ${files.length - filteredFiles.length} unwanted files)`)

      // Compress the project files for efficient transfer
      const compressedData = await compressProjectFiles(filteredFiles, [], [], { 
        project,
        authUserId,
        authUsername,
        isProduction: false // This is a preview site, should show badge
      })

      // Create a streaming request with EventSource-like handling
      const response = await fetch('/api/preview', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/octet-stream',
          'Accept': 'text/event-stream', // Request streaming response
          'X-Compressed': 'true'
        },
        body: compressedData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to create preview')
      }

      // If we get an immediate JSON response, handle it normally
      const contentType = response.headers.get('content-type')
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json()
        setPreview({
          sandboxId: data.sandboxId,
          url: data.url,
          isLoading: false,
          processId: data.processId,
        })
        setCurrentLog("Preview ready!")
        return
      }

      // Handle streaming response with EventSource-like message handling
      const reader = response.body?.getReader()
      if (reader) {
        setStreamReader(reader)
        const decoder = new TextDecoder()

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) {
              console.log('Stream ended')
              break
            }

            const chunk = decoder.decode(value, { stream: true })
            
            // Handle Server-Sent Events format - EventSource-like parsing
            if (chunk.includes('data: ')) {
              const lines = chunk.split('\n')
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const msg = JSON.parse(line.slice(6))
                    
                    // EventSource-like message handling (exactly like the example)
                    if (msg.type === "log") {
                      setCurrentLog(msg.message)
                      addConsoleLog(msg.message, 'server')
                    }

                    if (msg.type === "error") {
                      console.error('Preview error:', msg.message)
                      setCurrentLog(`Error: ${msg.message}`)
                      addConsoleLog(`❌ ${msg.message}`, 'server')
                      // Don't break the stream - continue receiving logs
                      // Only stop loading if it's a fatal error (contains specific keywords)
                      if (msg.message.includes('failed') || msg.message.includes('ERR!') || msg.message.includes('ENOENT')) {
                        setPreview(prev => ({ ...prev, isLoading: false }))
                      }
                      // Continue processing other messages
                    }

                    if (msg.type === "ready") {
                      // Server is ready, but we'll wait for "Production server running" message
                      // before actually loading the URL in the iframe
                      addConsoleLog("✅ Server ready", 'server')
                      
                      // Store the preview data but keep loading state
                      setPreview(prev => ({
                        ...prev,
                        sandboxId: msg.sandboxId,
                        url: msg.url,
                        processId: msg.processId,
                        isLoading: true, // Keep loading until build completes
                      }))

                      // Set custom loading message for the build phase
                      setCurrentLog("Building production bundle...")

                      // Start E2B log streaming for runtime logs
                      startE2BLogStreaming(msg.sandboxId, msg.processId)

                      // Auto-open console when server is ready
                      setIsConsoleOpen(true)

                      // For hosted previews (subdomain URLs), mark as ready immediately since no localhost server logs will appear
                      if (msg.url && !msg.url.includes('localhost')) {
                        setRocketPhase('landing')
                        setCurrentLog("Preview ready!")
                        setPreview(prev => ({ ...prev, isLoading: false }))
                        
                        // Dispatch preview ready event for hosted URLs
                        if (typeof window !== 'undefined' && preview.sandboxId && preview.url) {
                          window.dispatchEvent(new CustomEvent('preview-ready', { 
                            detail: { preview: { 
                              sandboxId: preview.sandboxId,
                              url: preview.url,
                              processId: preview.processId,
                              isLoading: false
                            } } 
                          }))
                        }
                      }
                      // DON'T break here - keep the stream open for continuous logs
                    }

                    // Check for build completion and actual server start
                    if (msg.type === "log") {
                      // Update current log for specific build stages
                      if (msg.message.includes("vite build") || msg.message.includes("next build")) {
                        setCurrentLog("Building production bundle...")
                      } else if (msg.message.includes("transforming")) {
                        setCurrentLog("Transforming modules...")
                      } else if (msg.message.includes("rendering chunks") || msg.message.includes("Generating static pages")) {
                        setCurrentLog("Rendering chunks...")
                      } else if (msg.message.includes("computing gzip size") || msg.message.includes("Finalizing page optimization")) {
                        setCurrentLog("Optimizing bundle size...")
                      } else if (msg.message.includes("preview") || msg.message.includes("start")) {
                        setCurrentLog("Starting production server...")
                      } else if (msg.message.includes("next dev") || msg.message.includes("pnpm dev") || msg.message.includes("npm run dev")) {
                        setCurrentLog("Starting development server...")
                      } else if (msg.message.includes("compiled successfully") || msg.message.includes("ready")) {
                        setCurrentLog("Dev server ready...")
                      }

                      // Switch rocket to landing phase when build completes or packages are installed
                      // For Vite: build completes before serving
                      if (msg.message.includes("Build completed successfully") || msg.message.includes("project hosted at")) {
                        setRocketPhase('landing')
                        setCurrentLog("Almost there...")
                      }
                      // For non-Vite frameworks (Next.js, Expo, etc): switch after dependencies installed
                      if (msg.message.includes("Dependencies installed successfully")) {
                        setRocketPhase('landing')
                        setCurrentLog("Starting server...")
                      }

                      // Vite detection - very specific
                      const isViteReady = msg.message.includes("➜ Local: http://localhost:")

                      // Next.js detection - must have the dash prefix which appears when server actually starts
                      const isNextReady = (
                        msg.message.includes("- Local:") && msg.message.includes("http://localhost:") ||
                        msg.message.includes("- Network:") && msg.message.includes("http://")
                      )

                      // Generic detection for custom servers
                      const isGenericReady = msg.message.includes("Production server running")

                      if (isViteReady || isNextReady || isGenericReady) {
                        // Now the server is actually ready to serve content
                        setRocketPhase('landing') // Ensure landing phase
                        setCurrentLog("Preview ready!")
                        setPreview(prev => ({ ...prev, isLoading: false }))

                        // Dispatch preview ready event NOW
                        if (typeof window !== 'undefined' && preview.sandboxId && preview.url) {
                          window.dispatchEvent(new CustomEvent('preview-ready', {
                            detail: { preview: {
                              sandboxId: preview.sandboxId,
                              url: preview.url,
                              processId: preview.processId,
                              isLoading: false
                            } }
                          }))
                        }
                      }
                    }

                    if (msg.type === "heartbeat") {
                      // Just keep the connection alive, no need to log heartbeats
                      continue
                    }
                  } catch (e) {
                    // Ignore parsing errors for non-JSON lines
                  }
                }
              }
            }
          }
        } catch (streamError) {
          console.error('Streaming error:', streamError)
          setCurrentLog("Streaming error occurred")
          addConsoleLog("❌ Streaming error occurred", 'server')
          setPreview(prev => ({ ...prev, isLoading: false }))
        } finally {
          reader.releaseLock()
          setStreamReader(null)
        }
      }

    } catch (error) {
      console.error('Error creating preview:', error)
      const errorMessage = error instanceof Error ? error.message : "Could not create preview environment"
      setCurrentLog(`Error: ${errorMessage}`)
      addConsoleLog(`❌ Error: ${errorMessage}`, 'server')
      setPreview(prev => ({ ...prev, isLoading: false }))
      toast({
        title: "Preview Failed",
        description: errorMessage,
        variant: "destructive",
      })
    }
  }

  const cleanupSandbox = async () => {
    if (!preview.sandboxId) return

    // Close the stream reader if it exists
    if (streamReader) {
      streamReader.cancel()
      setStreamReader(null)
    }

    try {
      await fetch('/api/preview', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sandboxId: preview.sandboxId }),
      })
    } catch (error) {
      console.error('Error cleaning up sandbox:', error)
    }

    const stoppedPreview = {
      sandboxId: null,
      url: null,
      isLoading: false,
      processId: null,
    }
    setPreview(stoppedPreview)
    setCurrentLog("Preview stopped")
    addConsoleLog("🛑 Preview stopped", 'server')
    
    // Dispatch preview stopped event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('preview-stopped', { 
        detail: { preview: stoppedPreview } 
      }))
    }
  }

  const refreshPreview = () => {
    // If files have changed since preview was created, do a full refresh with latest files
    if (filesChangedSincePreviewRef.current) {
      console.log('[CodePreviewPanel] Files changed - doing full preview refresh with latest files')
      refreshPreviewWithLatestFiles()
      return
    }

    // Otherwise just reload the iframe
    if (preview.url && previewIframeRef.current) {
      // Force iframe reload by updating src with cache-busting param
      const iframe = previewIframeRef.current;
      const currentSrc = iframe.src;
      // Add or update timestamp to force reload
      const url = new URL(currentSrc);
      url.searchParams.set('_refresh', Date.now().toString());
      iframe.src = url.toString();
    }
  }

  // Refresh the preview by syncing latest files to the existing sandbox
  // For Vite projects (hosted on Supabase at *.pipilot.dev), we need to rebuild and re-upload
  // For Next.js projects (running on E2B), we can sync files to the running sandbox
  const refreshPreviewWithLatestFiles = async () => {
    if (!project) {
      console.log('[CodePreviewPanel] No project - calling createPreview')
      createPreview()
      return
    }

    // For Vite/HTML projects hosted on Supabase, we need to rebuild and re-upload
    // These are hosted at {slug}.pipilot.dev (e.g., camtradehub.pipilot.dev)
    // E2B sandbox URLs contain .e2b.app or similar patterns
    const isPipilotHosted = preview.url ? /^https?:\/\/[^.]+\.pipilot\.dev/.test(preview.url) : false

    if (isViteProject || isPipilotHosted) {
      console.log('[CodePreviewPanel] Vite/Supabase-hosted project (*.pipilot.dev) - need to rebuild and re-upload')
      // For Vite projects, we must recreate the preview (rebuild + upload to Supabase)
      filesChangedSincePreviewRef.current = false
      createPreview()
      return
    }

    // For Next.js/other projects running on E2B sandbox, sync files directly
    if (!preview.sandboxId) {
      console.log('[CodePreviewPanel] No sandbox - calling createPreview instead')
      createPreview()
      return
    }

    try {
      console.log('[CodePreviewPanel] Syncing latest files to preview sandbox:', preview.sandboxId)

      // Use FileLookupService as primary source - same as chat-panel-v2
      let files: any[]
      try {
        if (fileLookupServiceRef.current && project.id) {
          await fileLookupServiceRef.current.initialize(project.id)
          await fileLookupServiceRef.current.refreshFiles()
          files = (fileLookupServiceRef.current as any)['files'] || []
          console.log(`[CodePreviewPanel] Loaded ${files.length} files via FileLookupService for sync`)
        } else {
          files = []
        }
      } catch (error) {
        console.error('[CodePreviewPanel] FileLookupService failed for sync:', error)
        files = []
      }

      // Fallback to parent prop or storageManager
      if (!files || files.length === 0) {
        if (parentProjectFiles && parentProjectFiles.length > 0) {
          files = parentProjectFiles
          console.log(`[CodePreviewPanel] Fallback to parent projectFiles for sync: ${files.length} files`)
        } else {
          const { storageManager } = await import('@/lib/storage-manager')
          await storageManager.init()
          await new Promise(resolve => setTimeout(resolve, 200))
          files = await storageManager.getFiles(project.id)
          console.log(`[CodePreviewPanel] Fallback to storageManager for sync: ${files?.length || 0} files`)
        }
      }

      if (!files || files.length === 0) {
        console.warn('[CodePreviewPanel] No files found, skipping refresh')
        return
      }

      // Filter unwanted files
      const filteredFiles = filterUnwantedFiles(files)
      console.log(`[CodePreviewPanel] Syncing ${filteredFiles.length} files to sandbox`)

      // Send files to the sync endpoint
      const response = await fetch('/api/preview/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sandboxId: preview.sandboxId,
          files: filteredFiles.map(f => ({
            path: f.path,
            content: f.content
          }))
        })
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('[CodePreviewPanel] Failed to sync files:', error)
        // Fall back to full preview recreation
        console.log('[CodePreviewPanel] Falling back to full preview recreation')
        createPreview()
        return
      }

      const result = await response.json()
      console.log('[CodePreviewPanel] Files synced successfully:', result)

      // Reset the files changed flag
      filesChangedSincePreviewRef.current = false

      // Reload the iframe to pick up the new files
      if (previewIframeRef.current) {
        const iframe = previewIframeRef.current
        const currentSrc = iframe.src
        const url = new URL(currentSrc)
        url.searchParams.set('_refresh', Date.now().toString())
        iframe.src = url.toString()
      }

      toast({
        title: "Preview Updated",
        description: "Latest file changes have been synced to the preview.",
      })
    } catch (error) {
      console.error('[CodePreviewPanel] Error syncing files:', error)
      // Fall back to full preview recreation
      console.log('[CodePreviewPanel] Falling back to full preview recreation')
      createPreview()
    }
  }

  // Helper: Transform path aliases (@/) to relative paths for Sandpack
  // In Vite/Next.js projects, @/ typically maps to /src/
  const resolvePathAliases = (content: string, filePath: string): string => {
    // Calculate relative path from file to /src/
    const fileDir = filePath.substring(0, filePath.lastIndexOf('/'))

    // Count how many levels deep we are from root
    const depth = fileDir.split('/').filter(Boolean).length

    // Calculate relative prefix to get to /src from current file location
    // e.g., /src/components/ui/button.tsx -> depth=4, needs ../../ to reach /src
    // The @/ alias maps to /src/, so from /src/components/ui/ we need ../../
    let relativeToSrc = ''
    if (fileDir.startsWith('/src')) {
      // Count levels within /src
      const levelsInSrc = fileDir.substring(4).split('/').filter(Boolean).length
      if (levelsInSrc === 0) {
        relativeToSrc = './'
      } else {
        relativeToSrc = '../'.repeat(levelsInSrc)
      }
    } else {
      // File is outside /src, use absolute-style relative path
      relativeToSrc = './src/'
    }

    // Replace @/ imports with relative paths
    // Match: from "@/...", from '@/...', import "@/...", import '@/...'
    const aliasPattern = /(from\s+['"])@\/([^'"]+)(['"])/g
    const aliasPattern2 = /(import\s+['"])@\/([^'"]+)(['"])/g

    let transformed = content.replace(aliasPattern, `$1${relativeToSrc}$2$3`)
    transformed = transformed.replace(aliasPattern2, `$1${relativeToSrc}$2$3`)

    return transformed
  }

  // Load project files into Sandpack format and show the Sandpack preview
  const openSandpackPreview = async () => {
    if (!project) return
    setSandpackLoading(true)

    try {
      const { storageManager } = await import('@/lib/storage-manager')
      const files = await storageManager.getFiles(project.id)

      // Binary/large file extensions to skip
      const skipExtensions = new Set([
        'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp', 'bmp',
        'mp4', 'mp3', 'wav', 'ogg', 'webm',
        'woff', 'woff2', 'ttf', 'eot', 'otf',
        'pdf', 'zip', 'tar', 'gz',
        'lock', 'DS_Store'
      ])

      // Files to skip as Sandpack files (bundler config, lockfiles, etc.)
      const skipFiles = new Set([
        'vite.config.ts', 'vite.config.js', 'vite.config.mjs',
        'tsconfig.json', 'tsconfig.node.json', 'tsconfig.app.json',
        'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock',
        '.eslintrc.cjs', '.eslintrc.js', 'eslint.config.js',
        'postcss.config.js', 'postcss.config.cjs', 'postcss.config.mjs',
        'tailwind.config.js', 'tailwind.config.ts',
        'vite-env.d.ts'
      ])

      // Vite-specific deps to exclude (Sandpack uses its own bundler)
      const excludeDeps = new Set([
        'vite', '@vitejs/plugin-react', '@vitejs/plugin-react-swc',
        'esbuild', 'esbuild-wasm', 'rollup',
        'typescript', '@types/react', '@types/react-dom', '@types/node',
        'eslint', 'prettier', 'autoprefixer', 'postcss',
        '@eslint/js', 'globals', 'eslint-plugin-react-hooks',
        'eslint-plugin-react-refresh', 'tailwindcss'
      ])

      // Step 1: Extract deps from package.json FIRST (before the file loop skips it)
      let deps: Record<string, string> = {}
      const pkgFile = files.find((f: StorageFile) => f.path === 'package.json')
      if (pkgFile?.content) {
        try {
          const pkg = JSON.parse(pkgFile.content)
          const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
          for (const [name, version] of Object.entries(allDeps)) {
            if (!excludeDeps.has(name) && !name.startsWith('@types/')) {
              deps[name] = version as string
            }
          }
        } catch {}
      }

      // Ensure react/react-dom are always present
      if (!deps['react']) deps['react'] = '^18.2.0'
      if (!deps['react-dom']) deps['react-dom'] = '^18.2.0'

      // Step 2: Build the Sandpack file map
      const spFiles: Record<string, { code: string }> = {}
      let skippedReasons: string[] = []

      for (const file of files) {
        const ext = file.path.split('.').pop()?.toLowerCase() || ''
        const fileName = file.path.split('/').pop() || ''

        // Log why critical files might be skipped
        const isCriticalFile = file.path.includes('App.tsx') || file.path.includes('main.tsx') || file.path.includes('index.tsx')

        if (!file.content) {
          if (isCriticalFile) skippedReasons.push(`${file.path}: no content`)
          continue
        }
        if (file.isDirectory) {
          continue
        }
        if (skipExtensions.has(ext)) {
          if (isCriticalFile) skippedReasons.push(`${file.path}: skip extension`)
          continue
        }
        if (skipFiles.has(fileName)) {
          if (isCriticalFile) skippedReasons.push(`${file.path}: skip file`)
          continue
        }
        if (file.path.startsWith('node_modules/') || file.path.startsWith('.git/') ||
            file.path.startsWith('dist/') || file.path.startsWith('build/')) {
          continue
        }

        // Sandpack needs paths starting with /
        const spPath = file.path.startsWith('/') ? file.path : `/${file.path}`

        // Transform path aliases (@/) to relative paths for Sandpack
        // In Vite/Next.js projects, @/ typically maps to /src/
        let transformedContent = file.content
        if (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx') {
          transformedContent = resolvePathAliases(file.content, spPath)
        }

        // Process CSS files: strip Tailwind directives and convert @apply for shadcn/ui
        if (ext === 'css') {
          transformedContent = transformedContent
            // Remove @tailwind directives - CDN handles these automatically
            .replace(/@tailwind\s+(base|components|utilities)\s*;?/g, '')
            // Remove @layer wrappers but keep the content inside
            .replace(/@layer\s+(base|components|utilities)\s*\{([\s\S]*?)\n\}/g, '$2')
            // Convert common @apply directives to actual CSS (shadcn/ui patterns)
            .replace(/@apply\s+border-border\s*;?/g, 'border-color: hsl(var(--border));')
            .replace(/@apply\s+bg-background\s+text-foreground\s*;?/g, 'background-color: hsl(var(--background)); color: hsl(var(--foreground));')
            .replace(/@apply\s+bg-background\s*;?/g, 'background-color: hsl(var(--background));')
            .replace(/@apply\s+text-foreground\s*;?/g, 'color: hsl(var(--foreground));')
          console.log('[Sandpack] Processed CSS file:', spPath)
        }

        spFiles[spPath] = { code: transformedContent }

        if (isCriticalFile) {
          console.log('[Sandpack] Added critical file:', spPath, '- length:', file.content.length)
        }
      }

      if (skippedReasons.length > 0) {
        console.warn('[Sandpack] Skipped critical files:', skippedReasons)
      }

      // Step 3: Determine the entry file
      // Without a template, we can use the project's actual entry file directly
      // Vite projects typically use /src/main.tsx, CRA uses /src/index.tsx
      let entryFile = '/src/index.tsx' // default
      if (spFiles['/src/main.tsx']) {
        entryFile = '/src/main.tsx'
      } else if (spFiles['/src/main.ts']) {
        entryFile = '/src/main.ts'
      } else if (spFiles['/src/main.jsx']) {
        entryFile = '/src/main.jsx'
      } else if (spFiles['/src/main.js']) {
        entryFile = '/src/main.js'
      } else if (spFiles['/src/index.tsx']) {
        entryFile = '/src/index.tsx'
      } else if (spFiles['/src/index.ts']) {
        entryFile = '/src/index.ts'
      } else if (spFiles['/src/index.jsx']) {
        entryFile = '/src/index.jsx'
      } else if (spFiles['/src/index.js']) {
        entryFile = '/src/index.js'
      }

      // Step 4: Prepare index.html for Sandpack
      // We need to ensure index.html exists and has a root div for React to mount
      // Also inject Tailwind CDN since Sandpack can't process Tailwind via PostCSS
      const tailwindCDN = '<script src="https://cdn.tailwindcss.com"></script>'

      // Extract tailwind.config.js content if it exists
      let tailwindConfigScript = ''
      const twConfigFile = files.find((f: StorageFile) =>
        f.path === 'tailwind.config.js' || f.path === 'tailwind.config.ts' || f.path === 'tailwind.config.mjs'
      )
      if (twConfigFile?.content) {
        try {
          // Extract the config object from the file
          // Handles: export default {...}, module.exports = {...}, export default defineConfig({...})
          let configContent = twConfigFile.content

          // Remove import statements
          configContent = configContent.replace(/^import\s+.*$/gm, '')

          // Extract the config object
          let configObj = ''

          // Match: export default { ... } or module.exports = { ... }
          const defaultExportMatch = configContent.match(/(?:export\s+default|module\.exports\s*=)\s*(\{[\s\S]*\})\s*;?\s*$/)
          if (defaultExportMatch) {
            configObj = defaultExportMatch[1]
          }

          // Match: export default defineConfig({ ... }) or similar wrapper
          const defineConfigMatch = configContent.match(/(?:export\s+default|module\.exports\s*=)\s*\w+\(\s*(\{[\s\S]*\})\s*\)\s*;?\s*$/)
          if (!configObj && defineConfigMatch) {
            configObj = defineConfigMatch[1]
          }

          if (configObj) {
            // Clean up the config: remove content array (not needed for CDN), plugins, etc.
            // The CDN only needs theme configuration
            configObj = configObj
              .replace(/content\s*:\s*\[[\s\S]*?\],?/g, '') // Remove content array
              .replace(/plugins\s*:\s*\[[\s\S]*?\],?/g, '') // Remove plugins array

            tailwindConfigScript = `<script>tailwind.config = ${configObj}</script>`
            console.log('[Sandpack] Injected tailwind.config')
          }
        } catch (e) {
          console.warn('[Sandpack] Failed to parse tailwind.config:', e)
        }
      }

      if (spFiles['/index.html']) {
        // Use project's index.html but ensure it has the root div
        let html = spFiles['/index.html'].code
        // If it references /src/main.tsx (Vite style), replace with the entry we're using
        html = html.replace(/\/src\/main\.tsx/g, entryFile)
        html = html.replace(/\/src\/main\.ts/g, entryFile)
        html = html.replace(/type="module"/g, '') // Sandpack handles modules differently

        // Inject Tailwind CDN and config if not already present
        if (!html.includes('tailwindcss')) {
          html = html.replace('</head>', `  ${tailwindCDN}\n  ${tailwindConfigScript}\n  </head>`)
        }

        spFiles['/index.html'] = { code: html }
      } else {
        // Create a minimal index.html with Tailwind CDN
        spFiles['/index.html'] = {
          code: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Preview</title>
    ${tailwindCDN}
    ${tailwindConfigScript}
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`
        }
      }

      // Debug: Log the key files to verify they're correct
      console.log('[Sandpack] Entry file:', entryFile)
      console.log('[Sandpack] Has /src/App.tsx:', !!spFiles['/src/App.tsx'])
      console.log('[Sandpack] Has /src/index.tsx:', !!spFiles['/src/index.tsx'])
      console.log('[Sandpack] File paths:', Object.keys(spFiles).slice(0, 20))
      if (spFiles['/src/App.tsx']) {
        console.log('[Sandpack] App.tsx first 200 chars:', spFiles['/src/App.tsx'].code.slice(0, 200))
      }

      setSandpackFiles(spFiles)
      setSandpackDeps(deps)
      setSandpackEntry(entryFile)
      setShowSandpackPreview(true)

      console.log('[Sandpack] Loaded', Object.keys(spFiles).length, 'files,', Object.keys(deps).length, 'deps')
    } catch (error) {
      console.error('[Sandpack] Error loading project files:', error)
      toast({
        title: "Failed to load Sandpack preview",
        description: String(error),
        variant: "destructive"
      })
    } finally {
      setSandpackLoading(false)
    }
  }

  const closeSandpackPreview = () => {
    setShowSandpackPreview(false)
    setSandpackFiles(null)
  }

  const exportProject = async () => {
    if (!project) return

    setIsExporting(true)

    try {
      // Fetch files from IndexedDB client-side
      const { storageManager } = await import('@/lib/storage-manager')
      await storageManager.init()
      const files = await storageManager.getFiles(project.id)
      
      if (!files || files.length === 0) {
        throw new Error('No files found in project')
      }

      // Dynamically load JSZip from CDN
      const loadJSZip = (): Promise<any> => {
        return new Promise((resolve, reject) => {
          // Check if JSZip is already loaded
          if (typeof window !== 'undefined' && (window as any).JSZip) {
            resolve((window as any).JSZip)
            return
          }

          // Create script element
          const script = document.createElement('script')
          script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'
          script.onload = () => {
            resolve((window as any).JSZip)
          }
          script.onerror = () => {
            reject(new Error('Failed to load JSZip library'))
          }
          
          document.head.appendChild(script)
        })
      }

      const JSZip = await loadJSZip()
      const zip = new JSZip()
      
      // Filter out images, videos, PDF files, scripts folders, test folders, and unwanted files to reduce export size
      const filteredFiles = filterUnwantedFiles(files)
      console.log(`[CodePreviewPanel] Filtered files for export: ${filteredFiles.length} of ${files.length} (removed ${files.length - filteredFiles.length} unwanted files)`)
      
      // Add files to zip
      filteredFiles.forEach(file => {
        // Remove the leading slash from file path if present
        // Remove the leading slash from file path if present
        const filePath = file.path.startsWith('/') ? file.path.substring(1) : file.path
        zip.file(filePath, file.content)
      })

      // Generate the zip file
      const blob = await zip.generateAsync({ type: 'blob' })
      
      // Create download link
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${project.name || 'project'}.zip`
      document.body.appendChild(a)
      a.click()
      
      // Clean up
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      toast({
        title: "Export Successful",
        description: "Project files have been downloaded as a ZIP archive",
      })
    } catch (error) {
      console.error('Export error:', error)
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Could not export project files",
        variant: "destructive",
      })
    } finally {
      setIsExporting(false)
    }
  }

  const clearConsole = () => {
    setConsoleOutput([])
  }

  const clearBrowserLogs = () => {
    setBrowserLogs([])
  }

  const clearAllLogs = () => {
    setConsoleOutput([])
  }

  const copyConsoleOutput = async () => {
    try {
      const consoleText = consoleOutput.join('\n')
      await navigator.clipboard.writeText(consoleText)
      toast({
        title: "Console output copied!",
        description: "The console logs have been copied to your clipboard.",
      })
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Failed to copy console output to clipboard.",
        variant: "destructive",
      })
    }
  }

  // Console resize handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing) return
    
    const newHeight = window.innerHeight - e.clientY
    const minHeight = 150
    const maxHeight = window.innerHeight * 0.8
    
    if (newHeight >= minHeight && newHeight <= maxHeight) {
      setConsoleHeight(newHeight)
    }
  }

  const handleMouseUp = () => {
    setIsResizing(false)
  }

  // Add global mouse event listeners for resizing
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'ns-resize'
      document.body.style.userSelect = 'none'
    } else {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing])

  // Simple EventSource connection function - implements the example pattern
  const startEventSourceConnection = (projectId: string, files: any[]) => {
    try {
      // For now, we'll use the existing fetch-based approach but with EventSource-like handling
      // The backend already streams properly, we just need to handle it like EventSource
      addConsoleLog("Starting preview process...", 'server')
      
      // The actual streaming is handled in the createPreview function
      // This function is called after the POST request initiates the streaming
      
    } catch (error) {
      console.error('Error starting EventSource connection:', error)
      addConsoleLog(`Failed to start streaming: ${error instanceof Error ? error.message : 'Unknown error'}`, 'server')
    }
  }

  // E2B streaming function - logs are already streaming through the main SSE connection
  const startE2BLogStreaming = async (sandboxId: string, processId: string | number) => {
    try {
      addConsoleLog(`E2B sandbox ${sandboxId} is ready for log streaming`, 'server')

      // Store process info for cleanup (no polling needed - logs stream via SSE)
      setBackgroundProcess(prev => ({
        ...prev,
        pid: Number(processId),
        command: 'npm run dev',
        isRunning: true,
        // No logInterval needed - logs stream through main connection
      }))

    } catch (error) {
      console.error('Error setting up E2B log streaming:', error)
      addConsoleLog(`Failed to setup log streaming: ${error instanceof Error ? error.message : 'Unknown error'}`, 'server')
    }
  }

  // Background process management functions
  const startBackgroundProcess = async (command: string) => {
    if (backgroundProcess.isRunning) {
      addConsoleLog('A process is already running. Stop it first.', 'process')
      return
    }

    try {
      addConsoleLog(`Starting background process: ${command}`, 'process')

      // In a real implementation, this would connect to your sandbox API
      // For now, we'll simulate the process starting
      const response = await fetch('/api/background-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, background: true }),
      })

      if (!response.ok) {
        throw new Error('Failed to start background process')
      }

      const data = await response.json()
      const pid = data.pid

      setBackgroundProcess({
        pid,
        command,
        isRunning: true
      })

      addConsoleLog(`Background process started with PID: ${pid}`, 'process')

      // Connect to the process stream
      await connectToProcess(pid)

    } catch (error) {
      console.error('Error starting background process:', error)
      addConsoleLog(`Failed to start process: ${error instanceof Error ? error.message : 'Unknown error'}`, 'process')
    }
  }

  const connectToProcess = async (pid: number) => {
    try {
      addConsoleLog(`Connecting to process stream for PID: ${pid}`, 'process')

      // Simulate connecting to process stream
      // In a real implementation, this would establish a WebSocket or SSE connection
      const response = await fetch(`/api/process-stream/${pid}`)

      if (!response.ok) {
        throw new Error('Failed to connect to process stream')
      }

      const reader = response.body?.getReader()
      if (reader) {
        const decoder = new TextDecoder()

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) {
              addConsoleLog('Process stream ended', 'process')
              break
            }

            const chunk = decoder.decode(value, { stream: true })

            // Parse the chunk as JSON (assuming server sends JSON-formatted logs)
            try {
              const logData = JSON.parse(chunk)
              if (logData.stdout) {
                addConsoleLog(logData.stdout, 'process')
              }
              if (logData.stderr) {
                addConsoleLog(logData.stderr, 'process')
              }
            } catch (parseError) {
              // If not JSON, treat as raw output
              addConsoleLog(chunk, 'process')
            }
          }
        } catch (streamError) {
          console.error('Streaming error:', streamError)
          addConsoleLog('Streaming error occurred', 'process')
        } finally {
          reader.releaseLock()
        }
      }
    } catch (error) {
      console.error('Error connecting to process:', error)
      addConsoleLog(`Failed to connect to process: ${error instanceof Error ? error.message : 'Unknown error'}`, 'process')
    }
  }

  const stopBackgroundProcess = async () => {
    if (!backgroundProcess.pid || !backgroundProcess.isRunning) {
      addConsoleLog('No process is currently running', 'server')
      return
    }

    try {
      addConsoleLog(`Stopping process with PID: ${backgroundProcess.pid}`, 'server')

      // Clear the log polling interval
      if (backgroundProcess.logInterval) {
        clearInterval(backgroundProcess.logInterval)
      }

      const response = await fetch(`/api/background-process/${backgroundProcess.pid}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to stop background process')
      }

      setBackgroundProcess({
        pid: null,
        command: null,
        isRunning: false
      })

      addConsoleLog('Background process stopped successfully', 'server')

    } catch (error) {
      console.error('Error stopping background process:', error)
      addConsoleLog(`Failed to stop process: ${error instanceof Error ? error.message : 'Unknown error'}`, 'server')
    }
  }

  const clearProcessLogs = () => {
    setProcessLogs([])
  }


  const openStackBlitz = async () => {
    if (!project) return
    if (isStackBlitzOpen) {
      console.log('StackBlitz is already being opened, ignoring duplicate request')
      return
    }

    setIsStackBlitzOpen(true)
    
    try {
      // Fetch files from IndexedDB client-side
      const { storageManager } = await import('@/lib/storage-manager')
      await storageManager.init()
      const files = await storageManager.getFiles(project.id)
      
      if (!files || files.length === 0) {
        throw new Error('No files found in project')
      }

      // Convert files to StackBlitz format
      const stackBlitzFiles: Record<string, string> = {}
      
      files.forEach(file => {
        // Remove leading slash and normalize path
        const normalizedPath = file.path.startsWith('/') ? file.path.substring(1) : file.path
        
        // Skip certain files that shouldn't be in StackBlitz
        if (normalizedPath.includes('node_modules') || 
            normalizedPath.includes('.git') ||
            normalizedPath.includes('package-lock.json') ||
            normalizedPath.includes('yarn.lock') ||
            normalizedPath.includes('pnpm-lock.yaml') ||
            normalizedPath.includes('.next') ||
            normalizedPath.includes('dist') ||
            normalizedPath.includes('build')) {
          return
        }
        
        stackBlitzFiles[normalizedPath] = file.content
      })

      // Ensure we have the required files for node template (Vite + TypeScript)
      if (!stackBlitzFiles['index.html']) {
        stackBlitzFiles['index.html'] = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${project.name || 'Vite + React + TS'}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`
      }

      if (!stackBlitzFiles['src/main.tsx']) {
        stackBlitzFiles['src/main.tsx'] = `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`
      }

      if (!stackBlitzFiles['src/App.tsx']) {
        stackBlitzFiles['src/App.tsx'] = `import React from 'react'
import './App.css'

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>🚗 ${project.name || 'Your Project'}</h1>
        <p>App generated by <strong>Pixel Builder</strong></p>
        <div style={{
          background: 'rgba(255,255,255,0.1)',
          padding: '2rem',
          borderRadius: '10px',
          margin: '2rem 0'
        }}>
          <h2>✅ StackBlitz Preview Working!</h2>
          <p>Your Vite + TypeScript project is now running in StackBlitz</p>
          <p><strong>${Object.keys(stackBlitzFiles).length} files</strong> loaded successfully</p>
          <p>Using <strong>pnpm</strong> for fast package management</p>
          <div style={{
            marginTop: '1rem',
            padding: '1rem',
            background: 'rgba(0,255,0,0.1)',
            borderRadius: '8px',
            border: '1px solid rgba(0,255,0,0.3)'
          }}>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>
              🎨 <strong>Pixel Builder</strong> - AI-powered app development platform
            </p>
          </div>
        </div>
      </header>
    </div>
  )
}

export default App`
      }

      // Ensure package.json has the right structure for Vite with pnpm
      if (!stackBlitzFiles['package.json']) {
        stackBlitzFiles['package.json'] = JSON.stringify({
          name: project.name || 'vite-react-ts',
          private: true,
          version: '0.0.0',
          type: 'module',
          packageManager: 'pnpm@8.0.0',
          scripts: {
            dev: 'vite',
            build: 'tsc && vite build',
            preview: 'vite preview'
          },
          dependencies: {
            react: '^18.2.0',
            'react-dom': '^18.2.0'
          },
          devDependencies: {
            '@types/react': '^18.2.0',
            '@types/react-dom': '^18.2.0',
            '@vitejs/plugin-react': '^4.0.0',
            typescript: '^5.0.0',
            vite: '^5.0.0'
          }
        }, null, 2)
      } else {
        // Update existing package.json to use pnpm
        try {
          const existingPackage = JSON.parse(stackBlitzFiles['package.json'])
          existingPackage.packageManager = 'pnpm@8.0.0'
          stackBlitzFiles['package.json'] = JSON.stringify(existingPackage, null, 2)
        } catch (e) {
          console.warn('Could not update existing package.json for pnpm:', e)
        }
      }

      // Ensure vite.config.ts exists
      if (!stackBlitzFiles['vite.config.ts']) {
        stackBlitzFiles['vite.config.ts'] = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
})`
      }

      // Add basic CSS if missing
      if (!stackBlitzFiles['src/App.css']) {
        stackBlitzFiles['src/App.css'] = `#root {
  max-width: 1280px;
  margin: 0 auto;
  padding: 2rem;
  text-align: center;
}

.App-header {
  background-color: #282c34;
  padding: 20px;
  color: white;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: calc(10px + 2vmin);
}`
      }

      if (!stackBlitzFiles['src/index.css']) {
        stackBlitzFiles['src/index.css'] = `:root {
  font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  font-weight: 400;
  color-scheme: light dark;
  color: rgba(255, 255, 255, 0.87);
  background-color: #242424;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  margin: 0;
  display: flex;
  place-items: center;
  min-width: 320px;
  min-height: 100vh;
}`
      }

      // Load StackBlitz SDK dynamically
      const loadStackBlitzSDK = (): Promise<any> => {
        return new Promise((resolve, reject) => {
          if (typeof window !== 'undefined' && (window as any).StackBlitzSDK) {
            console.log('StackBlitz SDK already loaded')
            resolve((window as any).StackBlitzSDK)
            return
          }

          console.log('Loading StackBlitz SDK...')
           const script = document.createElement('script')
          script.src = 'https://unpkg.com/@stackblitz/sdk@1/bundles/sdk.umd.js'
          script.onload = () => {
            console.log('StackBlitz SDK loaded successfully')
            // Give it a moment to initialize
            setTimeout(() => {
              if ((window as any).StackBlitzSDK) {
                resolve((window as any).StackBlitzSDK)
              } else {
                reject(new Error('StackBlitz SDK not found after loading'))
              }
            }, 100)
          }
          script.onerror = () => {
            console.error('Failed to load StackBlitz SDK script')
            reject(new Error('Failed to load StackBlitz SDK'))
          }
          
          document.head.appendChild(script)
        })
      }

      console.log('Starting StackBlitz project creation...')
      const StackBlitzSDK = await loadStackBlitzSDK()
      
      // Validate SDK and its methods
      if (!StackBlitzSDK) {
        throw new Error('StackBlitz SDK is not available')
      }
      
      if (typeof StackBlitzSDK.openProject !== 'function') {
        throw new Error('StackBlitz SDK openProject method is not available')
      }

      console.log('Opening StackBlitz project with', Object.keys(stackBlitzFiles).length, 'files')

      // Open StackBlitz project with node template (WebContainers)
      await StackBlitzSDK.openProject({
        title: `${project.name || 'App'} - Generated by Pixel Builder`,
        description: `AI-generated ${project.name || 'application'} built with Pixel Builder. Features ${Object.keys(stackBlitzFiles).length} files including Vite + React + TypeScript setup.`,
        template: 'node',
        files: stackBlitzFiles
      }, {
        newWindow: true,
        view: 'preview',
        theme: 'dark',
        hideDevTools: false,
        hideExplorer: false,
        terminalHeight: 20
      })
      
      toast({
        title: "StackBlitz Opened",
        description: `Opened ${Object.keys(stackBlitzFiles).length} files in StackBlitz`,
      })
    } catch (error) {
      console.error('Error opening StackBlitz:', error)
      toast({
        title: "StackBlitz Error",
        description: error instanceof Error ? error.message : "Could not open StackBlitz preview",
        variant: "destructive",
      })
    } finally {
      setIsStackBlitzOpen(false)
    }
  }

  const sampleCode = `import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function TodoApp() {
  const [todos, setTodos] = useState([])
  const [inputValue, setInputValue] = useState('')

  const addTodo = () => {
    if (inputValue.trim()) {
      setTodos([...todos, {
        id: Date.now(),
        text: inputValue,
        completed: false
      }])
      setInputValue('')
    }
  }

  const toggleTodo = (id) => {
    setTodos(todos.map(todo =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    ))
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Todo App</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex space-x-2">
          <Input
            placeholder="Add a new todo..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addTodo()}
          />
          <Button onClick={addTodo}>Add</Button>
        </div>
        <div className="space-y-2">
          {todos.map(todo => (
            <div
              key={todo.id}
              className={\`flex items-center space-x-2 p-2 rounded border \${
                todo.completed ? 'bg-muted' : ''
              }\`}
            >
              <input
                type="checkbox"
                checked={todo.completed}
                onChange={() => toggleTodo(todo.id)}
              />
              <span className={todo.completed ? 'line-through' : ''}>
                {todo.text}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}`

  // Helper function to truncate messages
  const truncateMessage = (message: string, maxLength: number) => {
    if (message.length <= maxLength) return message
    return message.substring(0, maxLength) + '...'
  }

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-950">
        <div className="text-center">
          <FileText className="h-12 w-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-300 mb-2">No Project Selected</h3>
          <p className="text-gray-500">Select a project from the sidebar to start building</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tabs - Hidden on mobile and when in preview tab on desktop */}
      {!isMobile && activeTab !== "preview" && (
        <div className="border-b border-gray-800/60 bg-gray-900/80">
          <div className="flex items-center justify-between px-4 py-2">
            <div className="flex space-x-1">
              {/* Desktop tabs would go here if needed */}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0">
        {activeTab === "code" ? (
          <ScrollArea className="h-full">
            <div className="p-4">
              <div className="bg-muted rounded-lg p-4 font-mono text-sm">
                <pre className="whitespace-pre-wrap text-muted-foreground">
                  <code>{sampleCode}</code>
                </pre>
              </div>
            </div>
          </ScrollArea>
        ) : activeTab === "preview" ? (
          <VisualEditorWrapper
            iframeRef={previewIframeRef}
            isEnabled={isVisualEditorEnabled}
            onToggle={setIsVisualEditorEnabled}
            onSaveChanges={onVisualEditorSave}
            projectType="nextjs"
            onApplyTheme={onApplyTheme}
            onTagToChat={onTagToChat}
            onPublish={onPublish}
            className="h-full"
          >
          <WebPreview
            className="h-full"
            defaultUrl={syncedUrl || preview.url || ""}
            defaultDevice={previewViewMode === 'mobile' ? DEVICE_PRESETS.find(d => d.name === 'iPhone 12/13') || null : null}
            onUrlChange={(url) => {
              setCustomUrl(url)
              onUrlChange?.(url)
              // Update preview state if needed
              setPreview(prev => ({ ...prev, url }))
            }}
          >
            <WebPreviewNavigation className="fixed top-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800/60">
              {/* Spacer to push all controls right */}
              {!isMobile && <div className="flex-1" />}

              {/* Chat Session Selector + Tab switching buttons - hidden on mobile */}
              {!isMobile && (
                <div className="flex items-center gap-0.5">
                  {project && userId && onSessionChange && (
                    <ChatSessionSelector
                      workspaceId={project.id}
                      userId={userId}
                      currentSessionId={currentSessionId || null}
                      onSessionChange={onSessionChange}
                      onNewSession={onNewSession}
                      compact={true}
                    />
                  )}
                  <WebPreviewNavigationButton
                    onClick={() => onTabChange("code")}
                    tooltip="Switch to Code View"
                  >
                    <Code className="h-4 w-4" />
                  </WebPreviewNavigationButton>
                  <WebPreviewNavigationButton
                    onClick={() => onTabChange("preview")}
                    disabled={true}
                    tooltip="Current: Preview View"
                  >
                    <Eye className="h-4 w-4" />
                  </WebPreviewNavigationButton>
                  <WebPreviewNavigationButton
                    onClick={() => onTabChange("cloud")}
                    tooltip="Switch to Cloud"
                  >
                    <Cloud className="h-4 w-4" />
                  </WebPreviewNavigationButton>
                </div>
              )}

              {/* For Expo: No Visual Editor/Responsive. For others: show icons only */}
              {!isExpoProject && (
                <>
                  <VisualEditorToggle
                    isEnabled={isVisualEditorEnabled}
                    onToggle={setIsVisualEditorEnabled}
                  />
                  {/* Device selector - hidden on mobile */}
                  {!isMobile && <WebPreviewDeviceSelector />}
                </>
              )}

              <WebPreviewUrl
                onRefresh={refreshPreview}
                onOpenExternal={() => {
                  if (preview.url) {
                    window.open(preview.url, '_blank')
                  }
                }}
                refreshDisabled={!preview.url}
                externalDisabled={!preview.url}
              />
              <WebPreviewNavigationButton
                onClick={createPreview}
                disabled={!project || preview.isLoading}
                tooltip="Start Preview"
              >
                <Play className="h-4 w-4" />
              </WebPreviewNavigationButton>
              {preview.sandboxId && (
                <WebPreviewNavigationButton
                  onClick={cleanupSandbox}
                  disabled={!preview.sandboxId}
                  tooltip="Stop Preview"
                >
                  <Square className="h-4 w-4" />
                </WebPreviewNavigationButton>
              )}

            </WebPreviewNavigation>

            <div className={isExpoProject ? "flex-1 min-h-0 pt-16 relative" : "flex-1 min-h-0 relative"}>
              {/* Sandpack Research Preview */}
              {showSandpackPreview && sandpackFiles ? (
                <div className="absolute inset-0 flex flex-col">
                  {/* Research banner */}
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 border-b border-orange-500/20 text-xs shrink-0">
                    <FlaskConical className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                    <span className="text-orange-600 dark:text-orange-400 font-medium">Research Preview</span>
                    <span className="text-muted-foreground">Sandpack in-browser runtime (no cloud sandbox)</span>
                    <button
                      onClick={closeSandpackPreview}
                      className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 overflow-hidden" style={{ position: 'relative' }}>
                    <SandpackProviderLazy
                      files={sandpackFiles}
                      customSetup={{
                        entry: sandpackEntry,
                        dependencies: sandpackDeps,
                        environment: "create-react-app",
                      }}
                      options={{
                        recompileMode: "delayed",
                        recompileDelay: 500,
                        autoReload: true,
                        autorun: true,
                      }}
                      theme="dark"
                    >
                      <SandpackPreviewLazy
                        style={{ height: "100%", width: "100%", position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                        showOpenInCodeSandbox={false}
                        showRefreshButton={true}
                      />
                    </SandpackProviderLazy>
                  </div>
                </div>
              ) : preview.isLoading ? (
                <div className="relative h-full w-full overflow-hidden">
                  {/* Full-window rocket GIF background */}
                  <img
                    key={rocketPhase}
                    src={rocketPhase === 'cruising'
                      ? 'https://pipilot.dev/assets/pipilot_rocket_cruise.gif'
                      : 'https://pipilot.dev/assets/pipilot_rocket_closing.gif'
                    }
                    alt={rocketPhase === 'cruising' ? 'Launching preview' : 'Landing preview'}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  {/* Status overlay at bottom */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent p-6">
                    <div className="text-center">
                      <h3 className="text-lg font-semibold text-white mb-1 drop-shadow-md">
                        {truncateMessage(currentLog, 50)}
                      </h3>
                      <p className="text-white/70 text-sm drop-shadow-sm">
                        {rocketPhase === 'cruising' ? 'Setting up your preview environment' : 'Almost ready...'}
                      </p>
                    </div>
                  </div>
                </div>
              ) : isAIStreaming ? (
                <AIRespondingView projectName={project?.name} />
              ) : preview.url ? (
                isExpoProject ? (
                  <div className="h-full w-full flex items-center justify-center p-4">
                    <div className="flex items-center justify-center" style={{
                      display: 'flex',
                      zIndex: 2000,
                      marginTop: '0px',
                      marginLeft: '0px',
                      height: 'auto',
                      width: '380px',
                      maxWidth: '320px',
                      minHeight: '550px',
                      marginBottom: '0px',
                      position: 'relative',
                      padding: '0px 15px 0px 15px',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      alignItems: 'center',
                      columnGap: '0px',
                      rowGap: '0px',
                      backgroundImage: 'url(https://assets-v2.codedesign.ai/storage/v1/object/public/codedesign-templates-assets/template-asset-015194df)',
                      backgroundPosition: '50% 50%',
                      backgroundSize: 'cover',
                      backgroundRepeat: 'no-repeat',
                      backgroundAttachment: 'scroll',
                      backgroundClip: 'border-box',
                      backgroundOrigin: 'padding-box',
                      borderRadius: '30px 30px 30px 30px'
                    }}>
                      {/* Phone Screen */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        width: '100%',
                        height: '500px',
                        margin: '0px',
                        position: 'relative',
                        maxWidth: '600px',
                        maxHeight: 'none',
                        minHeight: '550px'
                      }}>
                        <WebPreviewBody
                          className="rounded-[25px]"
                          src={preview.url}
                          ref={previewIframeRef}
                          onIframeRef={(iframe) => {
                            if (iframe) {
                              injectConsoleInterceptor(iframe)
                            }
                          }}
                          style={{
                            width: '95%',
                            height: '93%',
                            borderRadius: '20px 20px 20px 20px',
                            border: 'none'
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <WebPreviewBody
                    className="h-full"
                    src={preview.url}
                    ref={previewIframeRef}
                    onIframeRef={(iframe) => {
                      if (iframe) {
                        injectConsoleInterceptor(iframe)
                      }
                    }}
                  />
                )
              ) : (
                <PreviewEmptyState
                  projectName={project?.name}
                  onStartPreview={createPreview}
                  disabled={!project || preview.isLoading}
                />
              )}
            </div>

            <WebPreviewConsole
              logs={consoleOutput.map((output, index) => {
                const timestamp = new Date()
                let level: "log" | "warn" | "error" = "log"
                if (output.includes('ERROR:') || output.includes('❌') || (output.includes('[SERVER]') && output.includes('stderr'))) {
                  level = "error"
                } else if (output.includes('Warning:') || output.includes('⚠️')) {
                  level = "warn"
                }
                return {
                  level,
                  message: output.replace(/^\[\d{1,2}:\d{2}:\d{2} (?:AM|PM)\] [^\s]+ \[[A-Z]+\] /, ''),
                  timestamp
                }
              })}
              terminalLogs={consoleOutput}
              browserLogs={browserLogs}
              onAskAiToFix={(errors) => {
                // Dispatch custom event to fill chat input with error debugging request
                const errorList = errors.map((err, i) => `${i + 1}. ${err}`).join('\n')
                const prompt = `Debug and fix these browser console errors:\n\n${errorList}\n\nPlease analyze these errors and use your file edit tools to fix them.`
                window.dispatchEvent(new CustomEvent('ask-ai-to-fix', {
                  detail: { prompt, errors }
                }))
              }}
              onAskAiToFixTerminal={(errors) => {
                // Dispatch custom event to fill chat input with terminal error debugging request
                const errorList = errors.map((err, i) => `${i + 1}. ${err}`).join('\n')
                const prompt = `Debug and fix these terminal errors:\n\n${errorList}\n\nPlease analyze these errors and use your file edit tools to fix them.`
                window.dispatchEvent(new CustomEvent('ask-ai-to-fix', {
                  detail: { prompt, errors }
                }))
              }}
              onClearBrowserLogs={() => {
                setBrowserLogs([])
              }}
            />
          </WebPreview>
        </VisualEditorWrapper>
        ) : null}
      </div>

    </div>
  )
})

CodePreviewPanel.displayName = "CodePreviewPanel"