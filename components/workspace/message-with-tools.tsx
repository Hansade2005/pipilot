'use client'

import React, { useEffect, useState } from 'react'
import { Task, TaskTrigger, TaskContent, TaskItem } from '@/components/ai-elements/task'
import { ChainOfThought, ChainOfThoughtHeader, ChainOfThoughtContent, ChainOfThoughtStep } from '@/components/ai-elements/chain-of-thought'
import { Response } from '@/components/ai-elements/response'
import { FileText, Edit3, X, Package, PackageMinus, Loader2, CheckCircle2, XCircle, BrainIcon, FileCode,FolderOpen,Search, FileImage, FileJson, FileType, Settings, Package as PackageIcon, File, Globe, Eye, Zap, Database, Table, Code, Key, BarChart3, Monitor } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SupabaseConnectionCard } from './supabase-connection-card'
import { ContinueBackendCard } from './continue-backend-card'

// Inline tool call type for inline pill display
interface InlineToolCall {
  toolName: string
  toolCallId: string
  input?: any
  status: 'executing' | 'completed' | 'failed'
  textPosition?: number // Character position in text when tool was called
  reasoningPosition?: number // Character position in reasoning when tool was called
}

// Message type compatible with AI SDK v5
interface MessageWithToolsProps {
  message: any // Using any because AI SDK v5 types are complex
  projectId?: string
  isStreaming?: boolean
  onContinueToBackend?: (prompt: string) => void
  inlineToolCalls?: InlineToolCall[] // Optional inline tool calls with positions
}

// Component for Simple Icon with fallback
const SimpleIconWithFallback = ({ iconName, fallbackIcon, color }: { iconName: string, fallbackIcon: React.ReactNode, color: string }) => {
  const [imageError, setImageError] = useState(false)

  if (imageError) {
    return <>{fallbackIcon}</>
  }

  return (
    <img
      src={`https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/${iconName}.svg`}
      alt={iconName}
      className="h-4 w-4"
      style={{ filter: getColorFilter(color) }}
      onError={() => setImageError(true)}
    />
  )
}

// Color filter function for Simple Icons
const getColorFilter = (color: string) => {
  const colorMap: { [key: string]: string } = {
    'blue': 'invert(39%) sepia(93%) saturate(1473%) hue-rotate(211deg) brightness(101%) contrast(101%)',
    'yellow': 'invert(77%) sepia(88%) saturate(1053%) hue-rotate(2deg) brightness(107%) contrast(105%)',
    'pink': 'invert(67%) sepia(89%) saturate(749%) hue-rotate(296deg) brightness(101%) contrast(101%)',
    'orange': 'invert(73%) sepia(65%) saturate(530%) hue-rotate(1deg) brightness(102%) contrast(101%)',
    'green': 'invert(48%) sepia(79%) saturate(247%) hue-rotate(86deg) brightness(97%) contrast(101%)',
    'purple': 'invert(19%) sepia(86%) saturate(3090%) hue-rotate(258deg) brightness(101%) contrast(105%)',
    'red': 'invert(16%) sepia(95%) saturate(7153%) hue-rotate(0deg) brightness(104%) contrast(104%)',
    'cyan': 'invert(72%) sepia(26%) saturate(987%) hue-rotate(169deg) brightness(94%) contrast(93%)',
    'gray': 'invert(27%) sepia(51%) saturate(2878%) hue-rotate(346deg) brightness(104%) contrast(97%)'
  }
  return colorMap[color] || colorMap['gray']
}

// Get file icon based on file extension
const getFileIcon = (fileName: string) => {
  const extension = fileName.split('.').pop()?.toLowerCase()

  // Map file extensions to Simple Icons
  const getSimpleIcon = (iconName: string, fallbackIcon: React.ReactNode, color: string) => {
    return <SimpleIconWithFallback iconName={iconName} fallbackIcon={fallbackIcon} color={color} />
  }

  switch (extension) {
    case 'tsx':
    case 'jsx':
      return getSimpleIcon('react', <FileCode className="h-4 w-4 text-blue-500" />, 'blue')
    case 'ts':
      return getSimpleIcon('typescript', <FileType className="h-4 w-4 text-blue-500" />, 'blue')
    case 'js':
      return getSimpleIcon('javascript', <FileType className="h-4 w-4 text-yellow-500" />, 'yellow')
    case 'css':
      return getSimpleIcon('css3', <File className="h-4 w-4 text-blue-500" />, 'blue')
    case 'scss':
    case 'sass':
      return getSimpleIcon('sass', <File className="h-4 w-4 text-pink-500" />, 'pink')
    case 'html':
      return getSimpleIcon('html5', <FileText className="h-4 w-4 text-orange-600" />, 'orange')
    case 'json':
      return getSimpleIcon('json', <FileJson className="h-4 w-4 text-green-500" />, 'green')
    case 'md':
      return getSimpleIcon('markdown', <FileText className="h-4 w-4 text-purple-500" />, 'purple')
    case 'py':
      return getSimpleIcon('python', <FileCode className="h-4 w-4 text-blue-600" />, 'blue')
    case 'java':
      return getSimpleIcon('java', <FileCode className="h-4 w-4 text-red-600" />, 'red')
    case 'cpp':
    case 'c':
      return getSimpleIcon('cplusplus', <FileCode className="h-4 w-4 text-blue-700" />, 'blue')
    case 'php':
      return getSimpleIcon('php', <FileCode className="h-4 w-4 text-purple-600" />, 'purple')
    case 'rb':
      return getSimpleIcon('ruby', <FileCode className="h-4 w-4 text-red-500" />, 'red')
    case 'go':
      return getSimpleIcon('go', <FileCode className="h-4 w-4 text-cyan-600" />, 'cyan')
    case 'rs':
      return getSimpleIcon('rust', <FileCode className="h-4 w-4 text-orange-700" />, 'orange')
    case 'sh':
    case 'bat':
    case 'ps1':
      return getSimpleIcon('bash', <FileCode className="h-4 w-4 text-green-700" />, 'green')
    case 'sql':
      return getSimpleIcon('mysql', <FileText className="h-4 w-4 text-blue-800" />, 'blue')
    case 'txt':
    case 'log':
      return <FileText className="h-4 w-4 text-gray-500" />
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
      return <FileImage className="h-4 w-4 text-orange-500" />
    case 'svg':
      return getSimpleIcon('svg', <FileImage className="h-4 w-4 text-orange-500" />, 'orange')
    default:
      if (fileName === 'package.json') {
        return getSimpleIcon('npm', <PackageIcon className="h-4 w-4 text-red-500" />, 'red')
      }
      if (fileName === 'yarn.lock') {
        return getSimpleIcon('yarn', <PackageIcon className="h-4 w-4 text-blue-500" />, 'blue')
      }
      if (fileName === 'pnpm-lock.yaml') {
        return getSimpleIcon('pnpm', <PackageIcon className="h-4 w-4 text-orange-500" />, 'orange')
      }
      if (fileName === 'Dockerfile') {
        return getSimpleIcon('docker', <FileCode className="h-4 w-4 text-blue-500" />, 'blue')
      }
      return <FileText className="h-4 w-4 text-gray-500" />
  }
}

// Inline Tool Pill Component for inline display within message content
const InlineToolPill = ({ toolName, input, status = 'executing' }: {
  toolName: string,
  input?: any,
  status?: 'executing' | 'completed' | 'failed'
}) => {
  // Icon for the tool type
  const getToolIcon = (tool: string) => {
    switch (tool) {
      case 'write_file': return <FileText className="w-3.5 h-3.5" />
      case 'edit_file':
      case 'client_replace_string_in_file': return <Edit3 className="w-3.5 h-3.5" />
      case 'read_file': return <Eye className="w-3.5 h-3.5" />
      case 'list_files': return <FolderOpen className="w-3.5 h-3.5" />
      case 'delete_file':
      case 'delete_folder': return <X className="w-3.5 h-3.5" />
      case 'remove_package': return <PackageMinus className="w-3.5 h-3.5" />
      case 'pipilotdb_create_database': return <Database className="w-3.5 h-3.5" />
      case 'pipilotdb_create_table':
      case 'supabase_create_table':
      case 'pipilotdb_list_tables':
      case 'supabase_list_tables_rls': return <Table className="w-3.5 h-3.5" />
      case 'pipilotdb_query_database':
      case 'supabase_execute_sql': return <Code className="w-3.5 h-3.5" />
      case 'pipilotdb_manipulate_table_data':
      case 'supabase_insert_data':
      case 'supabase_delete_data':
      case 'pipilotdb_read_table':
      case 'supabase_read_table':
      case 'pipilotdb_delete_table':
      case 'supabase_drop_table': return <Database className="w-3.5 h-3.5" />
      case 'pipilotdb_manage_api_keys':
      case 'supabase_fetch_api_keys': return <Key className="w-3.5 h-3.5" />
      case 'grep_search':
      case 'semantic_code_navigator': return <Search className="w-3.5 h-3.5" />
      case 'web_search':
      case 'web_extract': return <Globe className="w-3.5 h-3.5" />
      case 'browse_web': return <Monitor className="w-3.5 h-3.5" />
      case 'check_dev_errors': return <Settings className="w-3.5 h-3.5" />
      case 'deploy_preview': return <Globe className="w-3.5 h-3.5" />
      case 'generate_report': return <BarChart3 className="w-3.5 h-3.5" />
      case 'generate_image': return <FileImage className="w-3.5 h-3.5" />
      case 'generate_plan': return <FileText className="w-3.5 h-3.5" />
      case 'update_plan_progress': return <CheckCircle2 className="w-3.5 h-3.5" />
      case 'update_project_context': return <FileCode className="w-3.5 h-3.5" />
      case 'suggest_next_steps': return <Zap className="w-3.5 h-3.5" />
      case 'node_machine': return <Settings className="w-3.5 h-3.5" />
      case 'discover_tools': return <Search className="w-3.5 h-3.5" />
      default: return <Zap className="w-3.5 h-3.5" />
    }
  }

  // Short action verb
  const getActionVerb = (tool: string) => {
    switch (tool) {
      case 'write_file': return 'Write'
      case 'edit_file':
      case 'client_replace_string_in_file': return 'Edit'
      case 'read_file': return 'Read'
      case 'list_files': return 'List'
      case 'delete_file':
      case 'delete_folder': return 'Delete'
      case 'remove_package': return 'Remove'
      case 'grep_search': return 'Search'
      case 'semantic_code_navigator': return 'Analyze'
      case 'web_search': return 'Search'
      case 'web_extract': return 'Extract'
      case 'browse_web': return 'Browse'
      case 'check_dev_errors': return 'Check'
      case 'deploy_preview': return 'Deploy'
      case 'generate_image': return 'Generate'
      case 'generate_report': return 'Report'
      case 'generate_plan': return 'Generate Plan'
      case 'update_plan_progress': return 'Update Plan'
      case 'update_project_context': return 'Update Context'
      case 'suggest_next_steps': return 'Next Steps'
      case 'node_machine': return 'Execute'
      case 'pipilotdb_create_database': return 'Create DB'
      case 'pipilotdb_create_table':
      case 'supabase_create_table': return 'Create Table'
      case 'pipilotdb_query_database':
      case 'supabase_execute_sql': return 'Query'
      case 'pipilotdb_list_tables':
      case 'supabase_list_tables_rls': return 'List Tables'
      case 'pipilotdb_read_table':
      case 'supabase_read_table': return 'Read Table'
      case 'pipilotdb_delete_table':
      case 'supabase_drop_table': return 'Drop Table'
      case 'pipilotdb_manipulate_table_data':
      case 'supabase_insert_data': return 'Insert'
      case 'supabase_delete_data': return 'Delete'
      case 'pipilotdb_manage_api_keys':
      case 'supabase_fetch_api_keys': return 'API Keys'
      case 'create_snapshot': return 'Snapshot'
      case 'code_quality_analysis':
      case 'code_review': return 'Review'
      case 'auto_documentation': return 'Document'
      case 'discover_tools': return 'Discover'
      default: return tool.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    }
  }

  // Context badge text (filename, query, etc.)
  const getContextBadge = (tool: string, args?: any): string | null => {
    if (!args) return null
    switch (tool) {
      case 'write_file':
      case 'delete_file':
      case 'read_file': return args.path?.split('/').pop() || null
      case 'edit_file':
      case 'client_replace_string_in_file': return args.filePath?.split('/').pop() || null
      case 'delete_folder': return args.path?.split('/').pop() || null
      case 'list_files': return args.path || null
      case 'remove_package': return args.packageName || args.name || null
      case 'grep_search':
      case 'semantic_code_navigator': return args.query ? `"${args.query}"` : null
      case 'web_search': return args.query ? `"${args.query}"` : null
      case 'web_extract': return args.url ? new URL(args.url).hostname : null
      case 'browse_web': return args.url ? new URL(args.url).hostname : null
      case 'deploy_preview': return args.deployMessage || null
      case 'pipilotdb_create_database': return args.name || null
      case 'pipilotdb_create_table':
      case 'supabase_create_table': return args.tableName || null
      case 'node_machine': return args.command?.split(' ')[0] || null
      case 'generate_plan': return '.pipilot/plan.md'
      case 'update_plan_progress': return args.stepNumber ? `Step ${args.stepNumber}` : '.pipilot/plan.md'
      case 'update_project_context': return '.pipilot/project.md'
      case 'suggest_next_steps': return args.suggestions?.length ? `${args.suggestions.length} suggestions` : null
      case 'discover_tools': return args.query ? `"${args.query}"` : args.category || null
      default: return null
    }
  }

  const contextBadge = getContextBadge(toolName, input)

  // Determine if this pill should deep-link to a file in the editor
  const getFilePath = (tool: string, args?: any): string | null => {
    let p: string | null = null
    if (!args) {
      // For plan/context tools, we know the path even without args
      if (tool === 'generate_plan' || tool === 'update_plan_progress') return '.pipilot/plan.md'
      if (tool === 'update_project_context') return '.pipilot/project.md'
      return null
    }
    switch (tool) {
      case 'write_file':
      case 'delete_file':
      case 'read_file': p = args.path || null; break
      case 'edit_file':
      case 'client_replace_string_in_file': p = args.filePath || null; break
      case 'generate_plan':
      case 'update_plan_progress': return '.pipilot/plan.md'
      case 'update_project_context': return '.pipilot/project.md'
      default: return null
    }
    // Normalize: strip leading / so path matches storage keys
    if (p && p.startsWith('/')) p = p.slice(1)
    return p
  }

  const linkedFilePath = getFilePath(toolName, input)

  const handleFileClick = () => {
    if (!linkedFilePath) return
    // Try both with and without leading / to match whichever format the workspace uses
    const normalizedPath = linkedFilePath.startsWith('/') ? linkedFilePath.slice(1) : linkedFilePath
    const slashedPath = '/' + normalizedPath
    window.dispatchEvent(new CustomEvent('openFileInEditor', {
      detail: { filePath: normalizedPath }
    }))
    // Also try with leading / in case workspace stores paths that way
    window.dispatchEvent(new CustomEvent('openFileInEditor', {
      detail: { filePath: slashedPath }
    }))
    window.dispatchEvent(new CustomEvent('focusFileInExplorer', {
      detail: { path: normalizedPath }
    }))
  }

  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="text-gray-500 flex-shrink-0">
        {getToolIcon(toolName)}
      </span>
      <span className="text-[13px] text-gray-300 font-medium">
        {getActionVerb(toolName)}
      </span>
      {contextBadge && (
        linkedFilePath ? (
          <button
            onClick={handleFileClick}
            className="text-[13px] bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-orange-400 px-2 py-0.5 rounded font-mono transition-colors cursor-pointer"
            title={`Open ${linkedFilePath}`}
          >
            {contextBadge}
          </button>
        ) : (
          <span className="text-[13px] bg-gray-800 text-gray-300 px-2 py-0.5 rounded font-mono">
            {contextBadge}
          </span>
        )
      )}
      {status === 'executing' && (
        <Loader2 className="w-3 h-3 text-gray-500 animate-spin flex-shrink-0" />
      )}
      {status === 'failed' && (
        <XCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
      )}
    </div>
  )
}

// Interleaved Content Component - Renders text with inline tool pills at correct positions
// positionKey specifies which position field to use: 'textPosition' or 'reasoningPosition'
const InterleavedContent = ({
  content,
  toolCalls,
  isStreaming = false,
  positionKey = 'textPosition',
  children
}: {
  content: string
  toolCalls: InlineToolCall[]
  isStreaming?: boolean
  positionKey?: 'textPosition' | 'reasoningPosition'
  children: (text: string) => React.ReactNode
}) => {
  // Get the position value based on the key
  const getPosition = (tc: InlineToolCall): number | undefined => {
    return positionKey === 'reasoningPosition' ? tc.reasoningPosition : tc.textPosition
  }

  // Filter out failed tool calls and require valid positions
  const toolsWithPositions = toolCalls.filter(tc => tc.status !== 'failed' && typeof getPosition(tc) === 'number')

  if (toolsWithPositions.length === 0) {
    return <>{children(content)}</>
  }

  // Sort by position, clamp to valid content range
  const contentLen = content.length
  const sortedTools = [...toolsWithPositions]
    .map(tc => ({ ...tc, _pos: Math.min(Math.max(getPosition(tc) || 0, 0), contentLen) }))
    .sort((a, b) => a._pos - b._pos)

  // Build segments: text chunks interleaved with tool pills
  // Snap positions to nearest paragraph/sentence boundary for cleaner rendering
  const segments: Array<{ type: 'text' | 'tool', content?: string, tool?: InlineToolCall }> = []
  let lastPosition = 0

  for (const tool of sortedTools) {
    let position = tool._pos

    // Snap to nearest line break or sentence end for cleaner pill placement
    if (position > lastPosition && position < contentLen) {
      // Look for nearest newline within ±50 chars
      const searchStart = Math.max(lastPosition, position - 50)
      const searchEnd = Math.min(contentLen, position + 50)
      const nearby = content.slice(searchStart, searchEnd)
      const relativePos = position - searchStart

      // Find closest newline
      let bestSnap = relativePos
      for (let i = 0; i < nearby.length; i++) {
        if (nearby[i] === '\n') {
          if (Math.abs(i - relativePos) < Math.abs(bestSnap - relativePos)) {
            bestSnap = i
          }
        }
      }
      position = Math.max(lastPosition, searchStart + bestSnap)
    }

    // Add text segment before this tool (if any)
    if (position > lastPosition) {
      const textSegment = content.slice(lastPosition, position)
      if (textSegment.trim()) {
        segments.push({ type: 'text', content: textSegment })
      }
    }

    // Add the tool pill
    segments.push({ type: 'tool', tool })
    lastPosition = Math.max(lastPosition, position)
  }

  // Add remaining text after the last tool
  if (lastPosition < contentLen) {
    const remaining = content.slice(lastPosition)
    if (remaining.trim()) {
      segments.push({ type: 'text', content: remaining })
    }
  }

  return (
    <div className="interleaved-content space-y-2">
      {segments.map((segment, index) => {
        if (segment.type === 'text' && segment.content) {
          return (
            <div key={`text-${index}`}>
              {children(segment.content)}
            </div>
          )
        }
        if (segment.type === 'tool' && segment.tool) {
          return (
            <div key={`tool-${segment.tool.toolCallId}`} className="my-2">
              <InlineToolPill
                toolName={segment.tool.toolName}
                input={segment.tool.input}
                status={segment.tool.status}
              />
            </div>
          )
        }
        return null
      })}
      {/* Show streaming indicator after last tool if streaming and last tool is executing */}
      {isStreaming && sortedTools.length > 0 && sortedTools[sortedTools.length - 1].status === 'executing' && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm mt-2">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Executing...</span>
        </div>
      )}
    </div>
  )
}

export function MessageWithTools({ message, projectId, isStreaming = false, onContinueToBackend, inlineToolCalls }: MessageWithToolsProps) {
  // In AI SDK v5, messages have different structure
  // Check for both possible tool structures
  const toolInvocations = (message as any).toolInvocations || []
  const hasTools = toolInvocations && toolInvocations.length > 0

  // Get reasoning and response content
  // Support both 'reasoning' and 'reasoningText' for compatibility with different providers
  const reasoningContent = (message as any).reasoning || (message as any).reasoningText || ''
  const responseContent = (message as any).content || ''
  // Get reasoning blocks for inline position tracking (new format)
  const reasoningBlocks: { content: string, textPosition: number }[] = (message as any).reasoningBlocks || []
  const hasInlineReasoningBlocks = reasoningBlocks.length > 0

  const hasReasoning = reasoningContent.trim().length > 0
  const hasResponse = responseContent.trim().length > 0

  // Get saved duration from metadata (for past messages)
  const savedDuration = message.metadata?.durationSeconds

  // Timer state for duration display (using Reasoning component's strategy)
  const [duration, setDuration] = useState(savedDuration || 0)
  const [startTime, setStartTime] = useState<number | null>(null)

  // Track duration when streaming starts and ends (same as Reasoning component)
  useEffect(() => {
    // For past messages with saved duration, use it
    if (!isStreaming && savedDuration !== undefined) {
      setDuration(savedDuration)
      setStartTime(null)
      return
    }

    // For streaming messages
    if (isStreaming) {
      if (startTime === null) {
        // Start timing when streaming begins
        setStartTime(Date.now())
      }
    } else if (startTime !== null) {
      // Calculate final duration when streaming ends
      const calculatedDuration = Math.ceil((Date.now() - startTime) / 1000)
      setDuration(Math.max(1, calculatedDuration)) // Ensure minimum 1 second
      setStartTime(null)
    }
  }, [isStreaming, startTime, savedDuration])

  // Live timer update during streaming (same as Reasoning component)
  useEffect(() => {
    if (!isStreaming || startTime === null) return

    const interval = setInterval(() => {
      const elapsed = Math.ceil((Date.now() - startTime) / 1000)
      setDuration(Math.max(1, elapsed))
    }, 1000)

    return () => clearInterval(interval)
  }, [isStreaming, startTime])

  // Format elapsed time as "X seconds" or "X minutes"
  const formatDuration = (seconds: number) => {
    if (seconds < 60) {
      return `${seconds} second${seconds !== 1 ? 's' : ''}`
    }
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    if (remainingSeconds === 0) {
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`
    }
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`
  }

  // Dispatch events when tools complete
  useEffect(() => {
    if (!hasTools || !projectId) return

    toolInvocations?.forEach((toolInvocation: any) => {
      if (toolInvocation.state === 'result') {
        // Dispatch json-tool-executed event (maintains compatibility with existing system)
        window.dispatchEvent(new CustomEvent('json-tool-executed', {
          detail: {
            toolCall: {
              id: toolInvocation.toolCallId,
              tool: toolInvocation.toolName,
              args: toolInvocation.args,
              status: 'completed'
            },
            result: toolInvocation.result,
            immediate: true,
            projectId: projectId
          }
        }))

        // Dispatch files-changed event for file operations
        if (['write_file', 'edit_file', 'delete_file'].includes(toolInvocation.toolName)) {
          let filePath = 'unknown';
          
          if (toolInvocation.toolName === 'edit_file') {
            // For edit_file, the path is in args.filePath
            filePath = toolInvocation.result?.path || toolInvocation.args?.filePath || 'unknown';
          } else {
            // For other file operations, path is in args.path
            filePath = toolInvocation.result?.path || toolInvocation.args?.path || 'unknown';
          }
          
          window.dispatchEvent(new CustomEvent('files-changed', {
            detail: {
              projectId: projectId,
              action: toolInvocation.toolName,
              path: filePath,
              source: 'ai-sdk-tool',
              toolCallId: toolInvocation.toolCallId
            }
          }))
        }

        // Dispatch files-changed event for package operations
        if (['remove_package'].includes(toolInvocation.toolName)) {
          window.dispatchEvent(new CustomEvent('files-changed', {
            detail: {
              projectId: projectId,
              action: toolInvocation.toolName,
              path: 'package.json',
              source: 'ai-sdk-tool',
              toolCallId: toolInvocation.toolCallId
            }
          }))
        }
      }
    })
  }, [toolInvocations, projectId, hasTools])

  // Helper functions for ChainOfThought tool steps
  const getToolIcon = (toolName: string) => {
    switch (toolName) {
      case 'write_file': return FileText
      case 'edit_file': return Edit3
      case 'delete_file': return X
      case 'delete_folder': return X
      case 'read_file': return Eye
      case 'list_files': return FolderOpen
      case 'remove_package': return PackageMinus
      case 'grep_search':
      case 'semantic_code_navigator': return Search
      case 'web_search':
      case 'web_extract':
      case 'vscode-websearchforcopilot_webSearch': return Globe
      case 'browse_web': return Monitor
      case 'check_dev_errors': return Settings
      default: return FileText
    }
  }

  const getToolLabel = (toolName: string, args?: any) => {
    switch (toolName) {
      case 'write_file':
        return `Creating ${args?.path ? args.path.split('/').pop() : 'file'}`
      case 'edit_file':
        return `Editing ${args?.filePath ? args.filePath.split('/').pop() : 'file'}`
      case 'delete_file':
        return `Deleting ${args?.path ? args.path.split('/').pop() : 'file'}`
      case 'read_file':
        return `Reading ${args?.path ? args.path.split('/').pop() : 'file'}`
      case 'list_files':
        return 'Listing files'
      case 'remove_package':
        return `Removing ${args?.packageName || 'package'}`
      case 'grep_search':
        return `Grep codebase for "${args?.query || 'pattern'}"`
      case 'semantic_code_navigator':
        return `Search codebase for "${args?.query || 'query'}"`
      case 'web_search':
      case 'vscode-websearchforcopilot_webSearch':
        return `Search web for "${args?.query || 'query'}"`
      case 'web_extract':
        return 'Extracting web content'
      case 'browse_web':
        return 'Using the Browser'
      case 'update_plan_progress':
        return 'Updating plan progress'
      case 'update_project_context':
        return 'Documenting project'
      case 'check_dev_errors':
        return 'Checking for errors'
      default:
        return toolName
    }
  }

  const getToolStatus = (toolInvocation: any): 'complete' | 'active' | 'pending' => {
    if (toolInvocation.state === 'result') {
      return toolInvocation.result?.error ? 'complete' : 'complete'
    }
    return isStreaming ? 'active' : 'complete'
  }

  // OLD renderToolInvocation function removed - now using ChainOfThought steps
  

  // Content wrapper classes - no prose, let Streamdown/Shiki handle code blocks natively
  const reasoningWrapperClasses = 'mt-2 text-sm text-gray-300 leading-relaxed overflow-hidden break-words [overflow-wrap:anywhere]'
  const textWrapperClasses = 'text-sm text-gray-200 leading-relaxed overflow-hidden break-words [overflow-wrap:anywhere]'

  // Response className overrides for links, strong text, and code styling
  const reasoningResponseClasses = cn(
    '[&>pre]:bg-gray-900/80 [&>pre]:border [&>pre]:border-gray-800/60',
    '[&_a]:text-blue-400 [&_a]:break-all',
    '[&_strong]:text-gray-100',
    '[&>p]:text-gray-300 [&>ul]:text-gray-300 [&>ol]:text-gray-300',
  )
  const textResponseClasses = cn(
    '[&>pre]:bg-gray-900/80 [&>pre]:border [&>pre]:border-gray-800/60',
    '[&_a]:text-blue-400 [&_a]:break-all',
    '[&_strong]:text-gray-100',
  )

  // Filter text-stream tool calls (used by both old and new rendering)
  const textStreamToolCalls = inlineToolCalls?.filter(tc => {
    if (tc.status === 'failed') return false
    const textPos = tc.textPosition ?? 0
    const reasoningPos = tc.reasoningPosition ?? 0
    return textPos > 0 || (textPos === 0 && reasoningPos === 0)
  }) || []

  return (
    <div className="space-y-3">
      {hasInlineReasoningBlocks ? (
        /* NEW: Inline reasoning blocks interleaved with text content at correct positions */
        (() => {
          const sortedBlocks = [...reasoningBlocks].sort((a, b) => a.textPosition - b.textPosition)

          // Build interleaved segments: reasoning blocks split the text at their textPosition
          const segments: Array<{
            type: 'text' | 'reasoning'
            content: string
            startPos: number
            endPos: number
          }> = []
          let lastTextPos = 0

          for (const block of sortedBlocks) {
            // Add text segment before this reasoning block (if any text exists)
            if (block.textPosition > lastTextPos) {
              const textSlice = responseContent.slice(lastTextPos, block.textPosition)
              if (textSlice.trim()) {
                segments.push({ type: 'text', content: textSlice, startPos: lastTextPos, endPos: block.textPosition })
              }
            }
            // Add the reasoning block
            if (block.content.trim()) {
              segments.push({ type: 'reasoning', content: block.content, startPos: block.textPosition, endPos: block.textPosition })
            }
            lastTextPos = block.textPosition
          }

          // Add remaining text after the last reasoning block
          if (lastTextPos < responseContent.length) {
            const remainingText = responseContent.slice(lastTextPos)
            if (remainingText.trim()) {
              segments.push({ type: 'text', content: remainingText, startPos: lastTextPos, endPos: responseContent.length })
            }
          }

          return (
            <>
              {segments.map((segment, idx) => {
                if (segment.type === 'reasoning') {
                  // Get tool calls that occurred during this reasoning block
                  const reasoningToolCalls = inlineToolCalls?.filter(tc => {
                    if (tc.status === 'failed') return false
                    const reasoningPos = tc.reasoningPosition ?? 0
                    const textPos = tc.textPosition ?? 0
                    // Tool was called during reasoning at this text position
                    return reasoningPos > 0 && textPos === segment.startPos
                  }) || []

                  return (
                    <ChainOfThought key={`reasoning-${idx}`} defaultOpen={false}>
                      <ChainOfThoughtHeader>
                        {isStreaming && idx >= segments.length - 1 && !hasResponse
                          ? `PiPilot is working ${duration > 0 ? formatDuration(duration) : ''}`
                          : 'PiPilot thought for a moment'
                        }
                      </ChainOfThoughtHeader>
                      <ChainOfThoughtContent>
                        <ChainOfThoughtStep
                          icon={BrainIcon}
                          label="Thinking Process"
                          status={isStreaming && !hasResponse ? 'active' : 'complete'}
                        >
                          <div className={reasoningWrapperClasses}>
                            {reasoningToolCalls.length > 0 ? (
                              <InterleavedContent
                                content={segment.content}
                                toolCalls={reasoningToolCalls}
                                isStreaming={isStreaming}
                                positionKey="reasoningPosition"
                              >
                                {(text) => <Response className={reasoningResponseClasses}>{text}</Response>}
                              </InterleavedContent>
                            ) : (
                              <Response className={reasoningResponseClasses}>{segment.content}</Response>
                            )}
                          </div>
                        </ChainOfThoughtStep>
                      </ChainOfThoughtContent>
                    </ChainOfThought>
                  )
                }

                if (segment.type === 'text') {
                  // Get tool calls within this text segment's position range
                  const segmentToolCalls = textStreamToolCalls.filter(tc => {
                    const pos = tc.textPosition ?? 0
                    return pos >= segment.startPos && pos < segment.endPos
                  }).map(tc => ({
                    ...tc,
                    // Adjust position relative to this segment's start
                    textPosition: (tc.textPosition ?? 0) - segment.startPos
                  }))

                  return (
                    <div key={`text-${idx}`} className={textWrapperClasses}>
                      {segmentToolCalls.length > 0 ? (
                        <InterleavedContent
                          content={segment.content}
                          toolCalls={segmentToolCalls}
                          isStreaming={isStreaming}
                        >
                          {(text) => <Response className={textResponseClasses}>{text}</Response>}
                        </InterleavedContent>
                      ) : (
                        <Response className={textResponseClasses}>{segment.content}</Response>
                      )}
                    </div>
                  )
                }

                return null
              })}
            </>
          )
        })()
      ) : (
        /* OLD: Reasoning at top in ChainOfThought (backwards compat for older messages without blocks) */
        <>
          {(hasReasoning || hasTools) && (
            <ChainOfThought defaultOpen={false}>
              <ChainOfThoughtHeader>
                {isStreaming
                  ? `PiPilot is working ${duration > 0 ? `${formatDuration(duration)}` : ''}`
                  : `PiPilot thought for a moment`
                }
              </ChainOfThoughtHeader>
              <ChainOfThoughtContent>
                {hasReasoning && (
                  <ChainOfThoughtStep
                    icon={BrainIcon}
                    label="Thinking Process"
                    status={isStreaming && !hasResponse ? "active" : "complete"}
                  >
                    <div className={reasoningWrapperClasses}>
                      {inlineToolCalls && inlineToolCalls.length > 0 ? (
                        <InterleavedContent
                          content={reasoningContent}
                          toolCalls={inlineToolCalls}
                          isStreaming={isStreaming}
                          positionKey="reasoningPosition"
                        >
                          {(text) => <Response className={reasoningResponseClasses}>{text}</Response>}
                        </InterleavedContent>
                      ) : (
                        <Response className={reasoningResponseClasses}>{reasoningContent}</Response>
                      )}
                    </div>
                  </ChainOfThoughtStep>
                )}
              </ChainOfThoughtContent>
            </ChainOfThought>
          )}

          {hasResponse && (
            <div className={textWrapperClasses}>
              {textStreamToolCalls.length > 0 ? (
                <InterleavedContent
                  content={responseContent}
                  toolCalls={textStreamToolCalls}
                  isStreaming={isStreaming}
                >
                  {(text) => <Response className={textResponseClasses}>{text}</Response>}
                </InterleavedContent>
              ) : (
                <Response className={textResponseClasses}>{responseContent}</Response>
              )}
            </div>
          )}
        </>
      )}

      {/* generate_plan rendering is handled by chat-panel-v2.tsx to avoid duplication */}

      {/* Special rendering for request_supabase_connection tool */}
      {hasTools && toolInvocations?.some((tool: any) =>
        tool.toolName === 'request_supabase_connection' &&
        tool.state === 'result' &&
        tool.result?.output?.requiresSpecialRendering
      ) && (
        <div className="mt-4">
          {toolInvocations
            ?.filter((tool: any) =>
              tool.toolName === 'request_supabase_connection' &&
              tool.state === 'result' &&
              tool.result?.output?.requiresSpecialRendering
            )
            .map((tool: any) => (
              <SupabaseConnectionCard
                key={tool.toolCallId}
                title={tool.result.output.title}
                description={tool.result.output.description}
                labels={tool.result.output.labels}
              />
            ))}
        </div>
      )}

      {/* Special rendering for continue_backend_implementation tool */}
      {hasTools && toolInvocations?.some((tool: any) =>
        tool.toolName === 'continue_backend_implementation' &&
        tool.state === 'result' &&
        tool.result?.output?.requiresSpecialRendering
      ) && (
        <div className="mt-4">
          {toolInvocations
            ?.filter((tool: any) =>
              tool.toolName === 'continue_backend_implementation' &&
              tool.state === 'result' &&
              tool.result?.output?.requiresSpecialRendering
            )
            .map((tool: any) => (
              <ContinueBackendCard
                key={tool.toolCallId}
                title={tool.result.output.title}
                description={tool.result.output.description}
                prompt={tool.result.output.prompt}
                onContinue={(prompt) => {
                  // Trigger automatic continuation to backend implementation
                  if (onContinueToBackend) {
                    onContinueToBackend(prompt)
                  }
                }}
              />
            ))}
        </div>
      )}

      {/* Show loading indicator if streaming and no content yet */}
      {isStreaming && !hasReasoning && !hasResponse && !hasTools && (
        <div className="flex items-center justify-start gap-2.5 text-gray-400 text-sm bg-transparent h-fit py-1">
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      )}
    </div>
  )
}
