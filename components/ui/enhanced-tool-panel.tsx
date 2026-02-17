"use client"

import * as React from "react"
import { useState, useMemo } from "react"
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  Edit3,
  Trash2,
  Eye,
  FolderOpen,
  Package,
  PackageMinus,
  Search,
  Globe,
  Settings,
  Database,
  Table,
  Key,
  Code,
  Zap,
  Clock,
  DollarSign,
  GitBranch,
  SkipForward,
  Play,
  Pause,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

export interface ToolExecution {
  id: string
  toolName: string
  status: "pending" | "executing" | "completed" | "failed" | "skipped"
  args?: Record<string, any>
  result?: any
  error?: string
  startTime?: number
  endTime?: number
  tokenUsage?: { input: number; output: number }
}

interface ToolGroup {
  category: string
  tools: ToolExecution[]
}

interface EnhancedToolPanelProps {
  tools: ToolExecution[]
  isStreaming?: boolean
  elapsedTime?: number
  totalTokens?: { input: number; output: number }
  estimatedCost?: number
  onSkipTool?: (toolId: string) => void
  onApproveTool?: (toolId: string) => void
  onViewDiff?: (toolId: string) => void
  onPauseExecution?: () => void
  onResumeExecution?: () => void
  isPaused?: boolean
  className?: string
}

// Tool icon mapping
const getToolIcon = (toolName: string): LucideIcon => {
  const iconMap: Record<string, LucideIcon> = {
    write_file: FileText,
    edit_file: Edit3,
    delete_file: Trash2,
    delete_folder: Trash2,
    read_file: Eye,
    list_files: FolderOpen,
    remove_package: PackageMinus,
    grep_search: Search,
    semantic_code_navigator: Search,
    web_search: Globe,
    web_extract: Globe,
    check_dev_errors: Settings,
    create_database: Database,
    create_table: Table,
    query_database: Code,
    manipulate_table_data: Database,
    manage_api_keys: Key,
  }
  return iconMap[toolName] || Zap
}

// Tool category mapping
const getToolCategory = (toolName: string): string => {
  const categoryMap: Record<string, string> = {
    write_file: "File Operations",
    edit_file: "File Operations",
    delete_file: "File Operations",
    delete_folder: "File Operations",
    read_file: "File Operations",
    list_files: "File Operations",
    remove_package: "Package Management",
    grep_search: "Code Search",
    semantic_code_navigator: "Code Search",
    web_search: "Web Research",
    web_extract: "Web Research",
    check_dev_errors: "Development",
    create_database: "Database",
    create_table: "Database",
    query_database: "Database",
    manipulate_table_data: "Database",
    manage_api_keys: "Database",
  }
  return categoryMap[toolName] || "Other"
}

// Tool label formatting
const getToolLabel = (toolName: string, args?: Record<string, any>): string => {
  const fileName = args?.path?.split("/").pop() || args?.filePath?.split("/").pop() || ""

  const labelMap: Record<string, string> = {
    write_file: `Creating ${fileName || "file"}`,
    edit_file: `Editing ${fileName || "file"}`,
    delete_file: `Deleting ${fileName || "file"}`,
    delete_folder: `Deleting folder`,
    read_file: `Reading ${fileName || "file"}`,
    list_files: "Listing files",
    remove_package: `Removing ${args?.packageName || "package"}`,
    grep_search: `Searching for "${args?.query?.slice(0, 20) || "pattern"}"`,
    semantic_code_navigator: `Finding "${args?.query?.slice(0, 20) || "code"}"`,
    web_search: `Searching web for "${args?.query?.slice(0, 20) || "query"}"`,
    web_extract: "Extracting web content",
    check_dev_errors: "Checking for errors",
    create_database: `Creating database`,
    create_table: `Creating table "${args?.tableName || "table"}"`,
    query_database: "Querying database",
    manipulate_table_data: "Updating data",
    manage_api_keys: "Managing API keys",
    browse_web: "Using the Browser",
    update_plan_progress: "Updating plan progress",
    update_project_context: "Documenting project",
  }
  return labelMap[toolName] || toolName
}

// Single tool item component
function ToolItem({
  tool,
  onSkip,
  onApprove,
  onViewDiff,
  showControls = false,
}: {
  tool: ToolExecution
  onSkip?: () => void
  onApprove?: () => void
  onViewDiff?: () => void
  showControls?: boolean
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const Icon = getToolIcon(tool.toolName)
  const duration = tool.startTime && tool.endTime
    ? ((tool.endTime - tool.startTime) / 1000).toFixed(1)
    : null

  const getStatusColor = () => {
    switch (tool.status) {
      case "executing":
        return "border-blue-500/50 bg-blue-500/5"
      case "completed":
        return "border-green-500/50 bg-green-500/5"
      case "failed":
        return "border-red-500/50 bg-red-500/5"
      case "skipped":
        return "border-gray-500/50 bg-gray-500/5"
      default:
        return "border-border bg-muted/30"
    }
  }

  const getStatusIcon = () => {
    switch (tool.status) {
      case "executing":
        return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
      case "completed":
        return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
      case "failed":
        return <XCircle className="h-3.5 w-3.5 text-red-500" />
      case "skipped":
        return <SkipForward className="h-3.5 w-3.5 text-gray-500" />
      default:
        return <Clock className="h-3.5 w-3.5 text-muted-foreground" />
    }
  }

  const isFileOperation = ["write_file", "edit_file"].includes(tool.toolName)

  return (
    <div className={cn("border rounded-md transition-colors", getStatusColor())}>
      <div
        className="flex items-center gap-2 px-2 py-1.5 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-xs font-medium truncate">
          {getToolLabel(tool.toolName, tool.args)}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {duration && (
            <span className="text-[10px] text-muted-foreground">{duration}s</span>
          )}
          {getStatusIcon()}
          {(tool.result || tool.error) && (
            isExpanded ? (
              <ChevronUp className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            )
          )}
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (tool.result || tool.error) && (
        <div className="px-2 pb-2 pt-1 border-t border-border/50">
          {tool.error ? (
            <div className="text-xs text-red-500 bg-red-500/10 p-2 rounded">
              {tool.error}
            </div>
          ) : tool.result?.message ? (
            <div className="text-xs text-muted-foreground">
              {tool.result.message}
            </div>
          ) : null}

          {/* Action buttons for file operations */}
          {showControls && isFileOperation && tool.status === "executing" && (
            <div className="flex items-center gap-2 mt-2">
              {onViewDiff && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px]"
                  onClick={(e) => {
                    e.stopPropagation()
                    onViewDiff()
                  }}
                >
                  <Eye className="h-3 w-3 mr-1" />
                  Preview
                </Button>
              )}
              {onApprove && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] text-green-600 border-green-600/30 hover:bg-green-600/10"
                  onClick={(e) => {
                    e.stopPropagation()
                    onApprove()
                  }}
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Approve
                </Button>
              )}
              {onSkip && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] text-muted-foreground"
                  onClick={(e) => {
                    e.stopPropagation()
                    onSkip()
                  }}
                >
                  <SkipForward className="h-3 w-3 mr-1" />
                  Skip
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function EnhancedToolPanel({
  tools,
  isStreaming = false,
  elapsedTime = 0,
  totalTokens,
  estimatedCost,
  onSkipTool,
  onApproveTool,
  onViewDiff,
  onPauseExecution,
  onResumeExecution,
  isPaused = false,
  className,
}: EnhancedToolPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  // Group tools by category
  const groupedTools = useMemo(() => {
    const groups: Record<string, ToolExecution[]> = {}
    tools.forEach((tool) => {
      const category = getToolCategory(tool.toolName)
      if (!groups[category]) {
        groups[category] = []
      }
      groups[category].push(tool)
    })
    return groups
  }, [tools])

  // Calculate stats
  const stats = useMemo(() => {
    const completed = tools.filter((t) => t.status === "completed").length
    const failed = tools.filter((t) => t.status === "failed").length
    const executing = tools.filter((t) => t.status === "executing").length
    const pending = tools.filter((t) => t.status === "pending").length
    const total = tools.length
    const progress = total > 0 ? ((completed + failed) / total) * 100 : 0

    return { completed, failed, executing, pending, total, progress }
  }, [tools])

  // Format elapsed time
  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  if (tools.length === 0) return null

  return (
    <div className={cn("border rounded-lg bg-card overflow-hidden", className)}>
      {/* Header */}
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between px-3 py-2 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Agent Activity</span>
              {isStreaming && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 animate-pulse">
                  Live
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3">
              {/* Stats */}
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatTime(elapsedTime)}
                </span>
                {totalTokens && (
                  <span className="flex items-center gap-1">
                    <Code className="h-3 w-3" />
                    {totalTokens.input + totalTokens.output}
                  </span>
                )}
                {estimatedCost !== undefined && (
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    ${estimatedCost.toFixed(3)}
                  </span>
                )}
              </div>

              {/* Pause/Resume */}
              {isStreaming && onPauseExecution && onResumeExecution && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={(e) => {
                          e.stopPropagation()
                          isPaused ? onResumeExecution() : onPauseExecution()
                        }}
                      >
                        {isPaused ? (
                          <Play className="h-3.5 w-3.5" />
                        ) : (
                          <Pause className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isPaused ? "Resume" : "Pause"} execution
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </div>
        </CollapsibleTrigger>

        {/* Progress bar */}
        {isStreaming && (
          <Progress value={stats.progress} className="h-0.5 rounded-none" />
        )}

        <CollapsibleContent>
          <ScrollArea className="max-h-64">
            <div className="p-2 space-y-3">
              {Object.entries(groupedTools).map(([category, categoryTools]) => (
                <div key={category} className="space-y-1.5">
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {category}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      ({categoryTools.length})
                    </span>
                  </div>
                  <div className="space-y-1">
                    {categoryTools.map((tool) => (
                      <ToolItem
                        key={tool.id}
                        tool={tool}
                        onSkip={onSkipTool ? () => onSkipTool(tool.id) : undefined}
                        onApprove={onApproveTool ? () => onApproveTool(tool.id) : undefined}
                        onViewDiff={onViewDiff ? () => onViewDiff(tool.id) : undefined}
                        showControls={isStreaming}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Summary footer */}
          <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/20 text-[10px] text-muted-foreground">
            <span>
              {stats.completed} completed
              {stats.failed > 0 && `, ${stats.failed} failed`}
              {stats.executing > 0 && `, ${stats.executing} running`}
            </span>
            <span>{stats.total} total operations</span>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
