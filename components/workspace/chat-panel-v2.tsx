/* 
 * ChatPanel V2 - AI SDK Real-Time Streaming Implementation with native tool support
 * Preserves all features from original chat-panel.tsx
 */

'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/use-toast"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { MessageWithTools } from './message-with-tools'
import {
  Send, Paperclip, Mic, MicOff, X, FileText, Image as ImageIcon,
  Link as LinkIcon, Loader2, ChevronDown, ChevronUp, StopCircle, Trash2, Plus,
  Copy, ArrowUp, ArrowDown, Undo2, Redo2, Check, AlertTriangle, Zap, Package, PackageMinus,
  Search, Globe, Eye, FolderOpen, Settings, Edit3, CheckCircle2, XCircle,
  Square, Database, CornerDownLeft, Table, Key, Code, Server, BarChart3,
  CreditCard, Coins, GitBranch, ChevronRight, ChevronLeft, Wrench,
  ToggleLeft, ToggleRight, Sparkles, FileUp, Hash, ExternalLink
} from 'lucide-react'
import { ModelSelector } from '@/components/ui/model-selector'
import { cn, filterUnwantedFiles } from '@/lib/utils'
import { Actions, Action } from '@/components/ai-elements/actions'
import { FileAttachmentDropdown } from "@/components/ui/file-attachment-dropdown"
import { FileAttachmentBadge } from "@/components/ui/file-attachment-badge"
import { FileSearchResult, FileLookupService } from "@/lib/file-lookup-service"
import { createCheckpoint } from '@/lib/checkpoint-utils'
import { streamRecoveryManager, type InterruptedStream } from '@/lib/stream-recovery-manager'
import { getWorkspaceDatabaseId, getDatabaseIdFromUrl } from '@/lib/get-current-workspace'
import { useSupabaseToken } from '@/hooks/use-supabase-token'
import { SupabaseConnectionCard } from './supabase-connection-card'
import { ContinueBackendCard } from './continue-backend-card'
import { zipSync, strToU8 } from 'fflate'
import { compress } from 'lz4js'
import { createClient } from '@/lib/supabase/client'
import { getWalletBalance } from '@/lib/billing/credit-manager'
import { PRODUCT_CONFIGS } from '@/lib/stripe-config'
import { uploadLargePayload } from '@/lib/cloud-sync'
// Note: modelSupportsVision removed - all images now go through describe-image API for consistent processing

// New feature components
import { SlashCommands, useSlashCommands, getDefaultSlashCommands, type SlashCommand } from '@/components/ui/slash-commands'
import { MemoryContextDisplay } from '@/components/ui/memory-context-display'
import { VoiceInputPanel } from '@/components/ui/voice-input-panel'
import { VisualDiffPreview, type FileChange } from '@/components/ui/visual-diff-preview'
import { EnhancedToolPanel, type ToolExecution } from '@/components/ui/enhanced-tool-panel'
import { ConversationBranchManager, BranchFromMessageButton, CreateBranchDialog, type ConversationBranch } from '@/components/ui/conversation-branch'
import { StreamingMessage } from '@/components/ui/streaming-text'
import { CodebaseSearch, type AttachedSearchContext, SearchContextPill } from '@/components/ui/codebase-search'

// Compress project files using LZ4 + Zip for efficient transfer
async function compressProjectFiles(
  projectFiles: any[],
  fileTree: string[],
  messagesToSend: any[],
  metadata: any
): Promise<ArrayBuffer> {
  
  // Filter out images, videos, PDF files, scripts folders, test folders, and unwanted files to reduce payload size
  const filteredFiles = filterUnwantedFiles(projectFiles)
  
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
  
  // Compress with LZ4
  const compressedData = await compress(zippedData)
  
  // Convert Uint8Array to ArrayBuffer
  const arrayBuffer = new ArrayBuffer(compressedData.length)
  new Uint8Array(arrayBuffer).set(compressedData)
  return arrayBuffer
}

// Fallback compression method (original LZ4 + Zip)
async function compressProjectFilesFallback(
  projectFiles: any[],
  fileTree: string[],
  messagesToSend: any[],
  metadata: any
): Promise<ArrayBuffer> {
  
  // Filter out images, videos, PDF files, scripts folders, test folders, and unwanted files to reduce payload size
  const filteredFiles = filterUnwantedFiles(projectFiles)
  
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
    originalFileCount: projectFiles.length
  }
  zipData['__metadata__.json'] = strToU8(JSON.stringify(fullMetadata))

  // Create zip file
  const zippedData = zipSync(zipData)
  
  // Compress with LZ4
  const compressedData = await compress(zippedData)
  
  // Convert Uint8Array to ArrayBuffer
  const arrayBuffer = new ArrayBuffer(compressedData.length)
  new Uint8Array(arrayBuffer).set(compressedData)
  return arrayBuffer
}

// Image preview type for user messages
interface MessageImagePreview {
  id: string
  name: string
  base64: string
}

// ExpandableUserMessage component for long user messages
const ExpandableUserMessage = ({
  content,
  messageId,
  images,
  onCopy,
  onDelete,
  onRetry,
  onRevert,
  onBranch,
  showRestore = false,
  isExpanded: controlledExpanded,
  onExpandedChange
}: {
  content: string
  messageId: string
  images?: MessageImagePreview[]
  onCopy: (messageId: string, content: string) => void
  onDelete: (messageId: string) => void
  onRetry: (messageId: string, content: string) => void
  onRevert: (messageId: string) => void
  onBranch?: (messageId: string) => void
  showRestore?: boolean
  isExpanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
}) => {
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(controlledExpanded ?? false)
  const [shouldTruncate, setShouldTruncate] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const CHAR_LIMIT = 140 // Character limit before truncation

  useEffect(() => {
    // Check if content exceeds character limit
    setShouldTruncate(content.length > CHAR_LIMIT)
  }, [content])

  useEffect(() => {
    if (controlledExpanded !== undefined) {
      setIsExpanded(controlledExpanded)
    }
  }, [controlledExpanded])

  useEffect(() => {
    if (onExpandedChange) {
      onExpandedChange(isExpanded)
    }
  }, [isExpanded, onExpandedChange])

  const handleIconClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRetry(messageId, content);
  };

  const handleRevert = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRevert(messageId);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(messageId);
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCopy(messageId, content);
  };

  const handleBranch = (e: React.MouseEvent) => {
    e.stopPropagation();
    onBranch?.(messageId);
  };

  const renderCheckpointButton = () => {
    if (showRestore) {
      return (
        <Action tooltip="Restore to this version" onClick={handleRevert}>
          <Redo2 className="w-4 h-4" />
        </Action>
      );
    }

    return (
      <Action tooltip="Revert to this version" onClick={handleRevert}>
        <Undo2 className="w-4 h-4" />
      </Action>
    );
  };

  if (!shouldTruncate) {
    return (
      <>
        <div className="relative w-full">
          <div className="bg-gray-800/70 rounded-2xl overflow-hidden w-full flex flex-col">
            <div className="px-4 py-3.5 break-words overflow-hidden" style={{ overflowWrap: 'anywhere' }}>
              {/* Image previews */}
              {images && images.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {images.map((img) => (
                    <img
                      key={img.id}
                      src={img.base64}
                      alt={img.name}
                      className="max-w-[120px] max-h-[90px] rounded-lg object-cover cursor-pointer hover:opacity-80 transition-opacity border border-gray-700/50"
                      onClick={() => setPreviewImage(img.base64)}
                      title={img.name}
                    />
                  ))}
                </div>
              )}
              <p className="text-gray-100 text-sm leading-[1.6] whitespace-pre-wrap text-left">
                {content}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-0.5 mt-1 sm:opacity-0 sm:hover:opacity-100 transition-opacity">
            <Action tooltip="Retry message" onClick={handleIconClick}>
              <ArrowUp className="w-3.5 h-3.5 text-gray-500 hover:text-gray-300" />
            </Action>
            {renderCheckpointButton()}
            {onBranch && (
              <Action tooltip="Branch from here" onClick={handleBranch}>
                <GitBranch className="w-3.5 h-3.5 text-gray-500 hover:text-gray-300" />
              </Action>
            )}
            <Action tooltip="Copy message" onClick={handleCopy}>
              <Copy className="w-3.5 h-3.5 text-gray-500 hover:text-gray-300" />
            </Action>
            <Action tooltip="Delete message" onClick={handleDelete}>
              <Trash2 className="w-3.5 h-3.5 text-gray-500 hover:text-gray-300" />
            </Action>
          </div>
        </div>

      {/* Image preview modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setPreviewImage(null)}
        >
          <button
            onClick={() => setPreviewImage(null)}
            className="absolute top-4 right-4 p-2 bg-secondary hover:bg-secondary/80 rounded-full transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={previewImage}
            alt="Preview"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
      </>
    )
  }

  return (
    <>
    <div className="relative w-full">
      <div className="bg-gray-800/70 rounded-2xl overflow-hidden relative w-full flex flex-col">
        <div className="px-4 py-3.5 break-words overflow-hidden" style={{ overflowWrap: 'anywhere' }}>
          {/* Image previews */}
          {images && images.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {images.map((img) => (
                <img
                  key={img.id}
                  src={img.base64}
                  alt={img.name}
                  className="max-w-[120px] max-h-[90px] rounded-lg object-cover cursor-pointer hover:opacity-80 transition-opacity border border-gray-700/50"
                  onClick={() => setPreviewImage(img.base64)}
                  title={img.name}
                />
              ))}
            </div>
          )}
          {/* Show truncated content when collapsed */}
          {!isExpanded ? (
            <div>
              <p className="text-gray-100 text-sm leading-[1.6] whitespace-pre-wrap text-left">
                {content.substring(0, CHAR_LIMIT)}
                {content.length > CHAR_LIMIT && '...'}
              </p>
            </div>
          ) : (
            /* Show full content when expanded with scrollable area */
            <div
              ref={contentRef}
              className="max-h-[300px] overflow-y-auto overflow-x-hidden"
              style={{
                scrollBehavior: 'smooth',
                WebkitOverflowScrolling: 'touch'
              }}
            >
              <p className="text-gray-100 text-sm leading-[1.6] whitespace-pre-wrap text-left">
                {content}
              </p>
            </div>
          )}
        </div>

        {/* Expand/Collapse trigger */}
        <div
          className="flex items-center justify-center px-4 py-2 border-t border-gray-700/40 hover:bg-gray-700/30 transition-colors cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <span className="text-xs text-gray-400 mr-2">
            {isExpanded ? 'Show less' : 'Show more'}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-3 h-3 text-gray-400" />
          ) : (
            <ChevronDown className="w-3 h-3 text-gray-400" />
          )}
        </div>
      </div>
      <div className="flex items-center justify-end gap-0.5 mt-1 opacity-0 hover:opacity-100 transition-opacity">
        <Action tooltip="Retry message" onClick={handleIconClick}>
          <ArrowUp className="w-3.5 h-3.5 text-gray-500 hover:text-gray-300" />
        </Action>
        {renderCheckpointButton()}
        {onBranch && (
          <Action tooltip="Branch from here" onClick={handleBranch}>
            <GitBranch className="w-3.5 h-3.5 text-gray-500 hover:text-gray-300" />
          </Action>
        )}
        <Action tooltip="Copy message" onClick={handleCopy}>
          <Copy className="w-3.5 h-3.5 text-gray-500 hover:text-gray-300" />
        </Action>
        <Action tooltip="Delete message" onClick={handleDelete}>
          <Trash2 className="w-3.5 h-3.5 text-gray-500 hover:text-gray-300" />
        </Action>
      </div>
    </div>

    {/* Image preview modal */}
    {previewImage && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
        onClick={() => setPreviewImage(null)}
      >
        <button
          onClick={() => setPreviewImage(null)}
          className="absolute top-4 right-4 p-2 bg-secondary hover:bg-secondary/80 rounded-full transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
        <img
          src={previewImage}
          alt="Preview"
          className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    )}
    </>
  )
}

// Enhanced Tool Activity Component - Collapsible with Progress
const ToolActivityPanel = ({
  toolCalls,
  isStreaming
}: {
  toolCalls: Array<{
    toolName: string
    toolCallId: string
    input?: any
    status: 'executing' | 'completed' | 'failed'
  }>
  isStreaming?: boolean
}) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showAll, setShowAll] = useState(false)

  if (!toolCalls || toolCalls.length === 0) return null

  // Helper functions - defined first to avoid temporal dead zone errors
  const getToolCategory = (toolName: string): string => {
    if (['write_file', 'edit_file', 'client_replace_string_in_file', 'delete_file', 'delete_folder'].includes(toolName)) {
      return '✏️ File Operations'
    }
    if (['read_file', 'list_files', 'grep_search', 'semantic_code_navigator'].includes(toolName)) {
      return '📖 Reading Files'
    }
    if (['create_database', 'create_table', 'supabase_create_table', 'query_database', 'supabase_execute_sql',
      'manipulate_table_data', 'supabase_insert_data', 'supabase_delete_data', 'list_tables',
      'supabase_list_tables_rls', 'read_table', 'supabase_read_table', 'delete_table', 'supabase_drop_table'].includes(toolName)) {
      return '💾 Database Operations'
    }
    if (['remove_package'].includes(toolName)) {
      return '📦 Package Management'
    }
    if (['web_search', 'web_extract'].includes(toolName)) {
      return '🌐 Web Operations'
    }
    if (['manage_api_keys', 'supabase_fetch_api_keys'].includes(toolName)) {
      return '🔑 API Management'
    }
    if (['generate_report'].includes(toolName)) {
      return '📊 Data Visualization'
    }
    return '⚡ Other Operations'
  }
  const getToolIcon = (tool: string) => {
    switch (tool) {
      case 'write_file':
        return <FileText className="w-3.5 h-3.5" />
      case 'edit_file':
        return <Edit3 className="w-3.5 h-3.5" />
      case 'client_replace_string_in_file':
        return <Edit3 className="w-3.5 h-3.5" />
      case 'read_file':
        return <Eye className="w-3.5 h-3.5" />
      case 'list_files':
        return <FolderOpen className="w-3.5 h-3.5" />
      case 'delete_file':
        return <X className="w-3.5 h-3.5" />
      case 'delete_folder':
        return <X className="w-3.5 h-3.5" />
      case 'remove_package':
        return <PackageMinus className="w-3.5 h-3.5" />
      case 'create_database':
        return <Database className="w-3.5 h-3.5" />
      case 'create_table':
      case 'supabase_create_table':
        return <Table className="w-3.5 h-3.5" />
      case 'query_database':
      case 'supabase_execute_sql':
        return <Code className="w-3.5 h-3.5" />
      case 'manipulate_table_data':
      case 'supabase_insert_data':
      case 'supabase_delete_data':
        return <Database className="w-3.5 h-3.5" />
      case 'manage_api_keys':
      case 'supabase_fetch_api_keys':
        return <Key className="w-3.5 h-3.5" />
      case 'list_tables':
      case 'supabase_list_tables_rls':
        return <Table className="w-3.5 h-3.5" />
      case 'read_table':
      case 'supabase_read_table':
        return <Eye className="w-3.5 h-3.5" />
      case 'delete_table':
      case 'supabase_drop_table':
        return <X className="w-3.5 h-3.5" />
      case 'grep_search':
      case 'semantic_code_navigator':
        return <Search className="w-3.5 h-3.5" />
      case 'web_search':
      case 'web_extract':
        return <Globe className="w-3.5 h-3.5" />
      case 'check_dev_errors':
        return <Settings className="w-3.5 h-3.5" />
      case 'generate_report':
        return <BarChart3 className="w-3.5 h-3.5" />
      default:
        return <Zap className="w-3.5 h-3.5" />
    }
  }

  const getToolLabel = (tool: string, args?: any) => {
    switch (tool) {
      case 'write_file':
        return `Creating ${args?.path ? args.path.split('/').pop() : 'file'}`
      case 'edit_file':
        return `Editing ${args?.filePath ? args.filePath.split('/').pop() : 'file'}`
      case 'client_replace_string_in_file':
        return `Replacing text in ${args?.filePath ? args.filePath.split('/').pop() : 'file'}`
      case 'delete_file':
        return `Deleting ${args?.path ? args.path.split('/').pop() : 'file'}`
      case 'delete_folder':
        return `Deleting folder ${args?.path ? args.path.split('/').pop() : 'folder'}`
      case 'read_file':
        return `Reading ${args?.path ? args.path.split('/').pop() : 'file'}`
      case 'list_files':
        return 'Listing files'
      case 'remove_package':
        return `Removing ${args?.packageName || 'package'}`
      case 'create_database':
        return `Creating database "${args?.name || 'main'}"`
      case 'create_table':
        return `Creating table "${args?.tableName || 'table'}"`
      case 'supabase_create_table':
        return `Creating Supabase table "${args?.tableName || 'table'}"`
      case 'query_database':
        return `Querying database`
      case 'supabase_execute_sql':
        return `Executing SQL on Supabase`
      case 'manipulate_table_data':
        return `Manipulating table data`
      case 'supabase_insert_data':
        return `Inserting data into Supabase table`
      case 'supabase_delete_data':
        return `Deleting data from Supabase table`
      case 'manage_api_keys':
        return `Managing API keys`
      case 'supabase_fetch_api_keys':
        return `Fetching Supabase API keys`
      case 'list_tables':
        return `Listing database tables`
      case 'supabase_list_tables_rls':
        return `Listing Supabase tables with RLS`
      case 'read_table':
        return `Reading table "${args?.tableName || 'table'}"`
      case 'supabase_read_table':
        return `Reading Supabase table "${args?.tableName || 'table'}"`
      case 'delete_table':
        return `Deleting table "${args?.tableName || 'table'}"`
      case 'supabase_drop_table':
        return `Dropping Supabase table "${args?.tableName || 'table'}"`
      case 'grep_search':
        return `Grep codebase for "${args?.query || 'pattern'}"`
      case 'semantic_code_navigator':
        return `Search codebase for "${args?.query || 'query'}"`
      case 'web_search':
        return `Search web for "${args?.query || 'query'}"`
      case 'web_extract':
        return 'Extracting web content'
      case 'check_dev_errors':
        return 'Checking for errors'
      case 'generate_report':
        return 'Generating data visualization report'
      default:
        return tool
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'executing':
        return <Loader2 className="w-3 h-3 animate-spin" />
      case 'completed':
        return <CheckCircle2 className="w-3 h-3" />
      case 'failed':
        return <XCircle className="w-3 h-3" />
      default:
        return null
    }
  }

  // Filter out failed tool calls - only show executing and completed
  const visibleToolCalls = toolCalls.filter(t => t.status !== 'failed')

  // If all operations failed, don't display the panel
  if (visibleToolCalls.length === 0) return null

  // Calculate statistics (based on visible operations only)
  const totalOps = visibleToolCalls.length
  const completedOps = visibleToolCalls.filter(t => t.status === 'completed').length
  const executingOps = visibleToolCalls.filter(t => t.status === 'executing').length
  const progressPercent = totalOps > 0 ? Math.round((completedOps / totalOps) * 100) : 0

  // Group operations by type (only visible ones)
  const groupedOps = visibleToolCalls.reduce((accumulator, tool) => {
    const category = getToolCategory(tool.toolName)
    if (!accumulator[category]) accumulator[category] = []
    accumulator[category].push(tool)
    return accumulator
  }, {} as Record<string, typeof visibleToolCalls>)

  // Get recent operations (last 4, only visible ones)
  const recentOps = visibleToolCalls.slice(-4).reverse()

  return (
    <div className="mb-3 rounded-lg border border-border/50 bg-muted/30 overflow-hidden">
      {/* Header - Always Visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">
            PiPilot's Activities
          </span>
          <span className="text-xs text-muted-foreground">
            {totalOps} operation{totalOps !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {executingOps > 0 && (
            <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>{executingOps} running</span>
            </div>
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Progress Bar */}
      <div className="px-3 pb-2">
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex justify-between items-center mt-1">
          <span className="text-[10px] text-muted-foreground">
            {completedOps}/{totalOps} completed
          </span>
          <span className="text-[10px] font-medium text-primary">
            {progressPercent}%
          </span>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-border/50 bg-background/50">
          {/* Recent Operations */}
          <div className="px-3 py-2">
            <div className="text-xs font-medium text-muted-foreground mb-2">
              Recent Operations
            </div>

            {/* Scrollable operations list */}
            {!showAll ? (
              // Show first 4 operations without scroll
              <div className="space-y-1.5">
                {recentOps.slice(0, 4).map((tool, idx) => (
                  <div
                    key={`${tool.toolCallId}-${idx}`}
                    className="flex items-center gap-2 text-xs py-1.5 px-2 rounded hover:bg-muted/50 transition-colors"
                  >
                    <div className={cn(
                      "flex-shrink-0",
                      tool.status === 'completed' && "text-green-600 dark:text-green-400",
                      tool.status === 'failed' && "text-red-600 dark:text-red-400",
                      tool.status === 'executing' && "text-blue-600 dark:text-blue-400"
                    )}>
                      {getToolIcon(tool.toolName)}
                    </div>
                    <span className="flex-1 truncate">
                      {getToolLabel(tool.toolName, tool.input)}
                    </span>
                    <div className="flex-shrink-0">
                      {getStatusIcon(tool.status)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // Show all operations with scrollable area
              <div
                className="max-h-[300px] overflow-y-auto space-y-1.5"
                style={{
                  scrollBehavior: 'smooth',
                  WebkitOverflowScrolling: 'touch'
                }}
              >
                {recentOps.map((tool, idx) => (
                  <div
                    key={`${tool.toolCallId}-${idx}`}
                    className="flex items-center gap-2 text-xs py-1.5 px-2 rounded hover:bg-muted/50 transition-colors"
                  >
                    <div className={cn(
                      "flex-shrink-0",
                      tool.status === 'completed' && "text-green-600 dark:text-green-400",
                      tool.status === 'failed' && "text-red-600 dark:text-red-400",
                      tool.status === 'executing' && "text-blue-600 dark:text-blue-400"
                    )}>
                      {getToolIcon(tool.toolName)}
                    </div>
                    <span className="flex-1 truncate">
                      {getToolLabel(tool.toolName, tool.input)}
                    </span>
                    <div className="flex-shrink-0">
                      {getStatusIcon(tool.status)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* View All / Show Less Toggle */}
          {totalOps > 4 && (
            <div className="px-3 pb-2">
              <button
                onClick={() => setShowAll(!showAll)}
                className="w-full text-xs text-primary hover:text-primary/80 py-1.5 px-2 rounded border border-primary/20 hover:bg-primary/5 transition-colors"
              >
                {showAll ? 'Show less' : `View all ${totalOps} operations`}
              </button>
            </div>
          )}

          {/* Grouped Summary */}
          {showAll && Object.keys(groupedOps).length > 1 && (
            <div className="border-t border-border/50 px-3 py-2 space-y-1">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Operations by Type
              </div>
              {Object.entries(groupedOps).map(([category, ops]) => (
                <div
                  key={category}
                  className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-muted/50 transition-colors"
                >
                  <span>{category}</span>
                  <span className="text-muted-foreground">{ops.length}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Inline Tool Pill Component (kept for backward compatibility if needed elsewhere)
const InlineToolPill = ({ toolName, input, status = 'executing' }: {
  toolName: string,
  input?: any,
  status?: 'executing' | 'completed' | 'failed'
}) => {
  const getToolIcon = (tool: string) => {
    switch (tool) {
      case 'write_file':
        return <FileText className="w-3.5 h-3.5" />
      case 'edit_file':
        return <Edit3 className="w-3.5 h-3.5" />
      case 'client_replace_string_in_file':
        return <Edit3 className="w-3.5 h-3.5" />
      case 'read_file':
        return <Eye className="w-3.5 h-3.5" />
      case 'list_files':
        return <FolderOpen className="w-3.5 h-3.5" />
      case 'delete_file':
        return <X className="w-3.5 h-3.5" />
      case 'delete_folder':
        return <X className="w-3.5 h-3.5" />
      case 'remove_package':
        return <PackageMinus className="w-3.5 h-3.5" />
      case 'create_database':
        return <Database className="w-3.5 h-3.5" />
      case 'create_table':
      case 'supabase_create_table':
        return <Table className="w-3.5 h-3.5" />
      case 'query_database':
      case 'supabase_execute_sql':
        return <Code className="w-3.5 h-3.5" />
      case 'manipulate_table_data':
      case 'supabase_insert_data':
      case 'supabase_delete_data':
        return <Database className="w-3.5 h-3.5" />
      case 'manage_api_keys':
      case 'supabase_fetch_api_keys':
        return <Key className="w-3.5 h-3.5" />
      case 'list_tables':
      case 'supabase_list_tables_rls':
        return <Table className="w-3.5 h-3.5" />
      case 'read_table':
      case 'supabase_read_table':
        return <Eye className="w-3.5 h-3.5" />
      case 'delete_table':
      case 'supabase_drop_table':
        return <X className="w-3.5 h-3.5" />
      case 'grep_search':
      case 'semantic_code_navigator':
        return <Search className="w-3.5 h-3.5" />
      case 'web_search':
      case 'web_extract':
        return <Globe className="w-3.5 h-3.5" />
      case 'check_dev_errors':
        return <Settings className="w-3.5 h-3.5" />
      case 'generate_report':
        return <BarChart3 className="w-3.5 h-3.5" />
      default:
        return <Zap className="w-3.5 h-3.5" />
    }
  }

  const getToolLabel = (tool: string, args?: any) => {
    switch (tool) {
      case 'write_file':
        return `Creating ${args?.path ? args.path.split('/').pop() : 'file'}`
      case 'edit_file':
        return `Editing ${args?.filePath ? args.filePath.split('/').pop() : 'file'}`
      case 'client_replace_string_in_file':
        return `Replacing text in ${args?.filePath ? args.filePath.split('/').pop() : 'file'}`
      case 'delete_file':
        return `Deleting ${args?.path ? args.path.split('/').pop() : 'file'}`
      case 'delete_folder':
        return `Deleting folder ${args?.path ? args.path.split('/').pop() : 'folder'}`
      case 'read_file':
        return `Reading ${args?.path ? args.path.split('/').pop() : 'file'}`
      case 'list_files':
        return 'Listing files'
      case 'remove_package':
        return `Removing ${args?.packageName || 'package'}`
      case 'create_database':
        return `Creating database "${args?.name || 'main'}"`
      case 'create_table':
        return `Creating table "${args?.tableName || 'table'}"`
      case 'supabase_create_table':
        return `Creating Supabase table "${args?.tableName || 'table'}"`
      case 'query_database':
        return `Querying database`
      case 'supabase_execute_sql':
        return `Executing SQL on Supabase`
      case 'manipulate_table_data':
        return `Manipulating table data`
      case 'supabase_insert_data':
        return `Inserting data into Supabase table`
      case 'supabase_delete_data':
        return `Deleting data from Supabase table`
      case 'manage_api_keys':
        return `Managing API keys`
      case 'supabase_fetch_api_keys':
        return `Fetching Supabase API keys`
      case 'list_tables':
        return `Listing database tables`
      case 'supabase_list_tables_rls':
        return `Listing Supabase tables with RLS`
      case 'read_table':
        return `Reading table "${args?.tableName || 'table'}"`
      case 'supabase_read_table':
        return `Reading Supabase table "${args?.tableName || 'table'}"`
      case 'delete_table':
        return `Deleting table "${args?.tableName || 'table'}"`
      case 'supabase_drop_table':
        return `Dropping Supabase table "${args?.tableName || 'table'}"`
      case 'grep_search':
        return `Grep codebase for "${args?.query || 'pattern'}"`
      case 'semantic_code_navigator':
        return `Search codebase for "${args?.query || 'query'}"`
      case 'web_search':
        return `Search web for "${args?.query || 'query'}"`
      case 'web_extract':
        return 'Extracting web content'
      case 'check_dev_errors':
        return 'Checking for errors'
      case 'generate_report':
        return 'Generating data visualization report'
      default:
        return tool
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'executing':
        return 'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400'
      case 'completed':
        return 'bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400'
      case 'failed':
        return 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400'
      default:
        return 'bg-muted/10 border-border text-muted-foreground'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'executing':
        return <Loader2 className="w-3.5 h-3.5 animate-spin" />
      case 'completed':
        return <CheckCircle2 className="w-3.5 h-3.5" />
      case 'failed':
        return <XCircle className="w-3.5 h-3.5" />
      default:
        return null
    }
  }

  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border mb-1 mr-1",
      getStatusColor(status)
    )}>
      {getToolIcon(toolName)}
      <span className="max-w-[200px] truncate">{getToolLabel(toolName, input)}</span>
      {getStatusIcon(status)}
    </div>
  )
}

// Interleaved Content Component - Renders text with inline tool pills at correct positions
// This mimics the session page's inline tool display behavior
const InterleavedContent = ({
  content,
  toolCalls,
  isStreaming = false,
  renderContent
}: {
  content: string
  toolCalls: Array<{
    toolName: string
    toolCallId: string
    input?: any
    status: 'executing' | 'completed' | 'failed'
    textPosition?: number
  }>
  isStreaming?: boolean
  renderContent: (text: string) => React.ReactNode
}) => {
  // If no tool calls with positions, just render the content
  const toolsWithPositions = toolCalls.filter(tc => typeof tc.textPosition === 'number')

  if (toolsWithPositions.length === 0) {
    return <>{renderContent(content)}</>
  }

  // Sort tool calls by position
  const sortedTools = [...toolsWithPositions].sort((a, b) => (a.textPosition || 0) - (b.textPosition || 0))

  // Build segments: text chunks interleaved with tool pills
  const segments: Array<{ type: 'text' | 'tool', content?: string, tool?: typeof sortedTools[0] }> = []
  let lastPosition = 0

  for (const tool of sortedTools) {
    const position = tool.textPosition || 0

    // Add text segment before this tool (if any)
    if (position > lastPosition) {
      const textSegment = content.slice(lastPosition, position)
      if (textSegment) {
        segments.push({ type: 'text', content: textSegment })
      }
    }

    // Add the tool pill
    segments.push({ type: 'tool', tool })
    lastPosition = position
  }

  // Add remaining text after the last tool
  if (lastPosition < content.length) {
    segments.push({ type: 'text', content: content.slice(lastPosition) })
  }

  return (
    <div className="interleaved-content">
      {segments.map((segment, index) => {
        if (segment.type === 'text' && segment.content) {
          return (
            <div key={`text-${index}`} className="mb-2">
              {renderContent(segment.content)}
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
      {/* Show streaming indicator after last tool if streaming */}
      {isStreaming && sortedTools.length > 0 && sortedTools[sortedTools.length - 1].status === 'executing' && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm mt-2">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Executing...</span>
        </div>
      )}
    </div>
  )
}

// Types
interface AttachedFile {
  id: string
  name: string
  path: string
  content?: string
}

interface AttachedImage {
  id: string
  name: string
  base64: string
  description?: string
  isProcessing?: boolean
  abortController?: AbortController
}

interface AttachedUrl {
  id: string
  url: string
  title?: string
  content?: string
  isProcessing?: boolean
}

interface AttachedUploadedFile {
  id: string
  name: string
  content: string
  size: number
}

// Tagged component from visual editor
interface TaggedComponent {
  id: string
  tagName: string
  sourceFile?: string
  sourceLine?: number
  className: string
  textContent?: string
}

// Maximum number of images that can be attached
const MAX_IMAGE_ATTACHMENTS = 5

interface MCPServerConfig {
  id: string
  name: string
  transport: string
  url?: string
  headers?: Record<string, string>
  env?: Record<string, string>
  enabled: boolean
}

interface ChatPanelV2Props {
  project: any
  isMobile?: boolean
  selectedModel?: string
  onModelChange?: (modelId: string) => void
  userPlan?: string
  subscriptionStatus?: string
  aiMode?: string
  onModeChange?: (mode: string) => void
  onClearChat?: () => void
  initialPrompt?: string
  taggedComponent?: TaggedComponent | null
  onClearTaggedComponent?: () => void
}

export function ChatPanelV2({
  project,
  isMobile = false,
  selectedModel = 'gpt-4o',
  onModelChange,
  userPlan = 'free',
  subscriptionStatus,
  aiMode = 'code',
  onModeChange,
  onClearChat,
  initialPrompt,
  taggedComponent,
  onClearTaggedComponent
}: ChatPanelV2Props) {
  const { toast } = useToast()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sendButtonRef = useRef<HTMLButtonElement>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const userIsNearBottomRef = useRef(true)

  // Debounce utility function
  const debounce = (func: Function, wait: number) => {
    let timeout: NodeJS.Timeout
    return (...args: any[]) => {
      clearTimeout(timeout)
      timeout = setTimeout(() => func.apply(null, args), wait)
    }
  }

  // Debounced textarea height adjustment to prevent lag during typing
  const debouncedHeightAdjustment = useCallback(
    debounce((textarea: HTMLTextAreaElement) => {
      // Reset to baseline then expand up to the max (90px)
      textarea.style.height = '90px';
      const newHeight = Math.min(textarea.scrollHeight, 140)
      textarea.style.height = newHeight + 'px';
      // Only show a vertical scrollbar when content exceeds the max height
      textarea.style.overflowY = textarea.scrollHeight > 140 ? 'auto' : 'hidden'
    }, 50), // 50ms debounce for height adjustments
    []
  );

  // Removed debounced file dropdown handler in favor of a tiny, synchronous regex-based detection
  // The heavy-path debouncing created extra scheduling overhead and state churn on desktop.
  // We'll do a minimal regex check in the onChange handler and only update state when the
  // detected query or visibility actually changes.

  // File attachments state (preserve from original)
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([])
  const [attachedUploadedFiles, setAttachedUploadedFiles] = useState<AttachedUploadedFile[]>([])
  const [attachedUrls, setAttachedUrls] = useState<AttachedUrl[]>([])

  // @ command file attachment dropdown state
  const [showFileDropdown, setShowFileDropdown] = useState(false)
  const [fileQuery, setFileQuery] = useState("")
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 })
  const [atCommandStartIndex, setAtCommandStartIndex] = useState(-1)

  // Checkpoint/restore state
  const [restoreMessageId, setRestoreMessageId] = useState<string | null>(null)
  const [showRevertDialog, setShowRevertDialog] = useState(false)
  const [revertMessageId, setRevertMessageId] = useState<string | null>(null)
  const [isReverting, setIsReverting] = useState(false)

  // UI state
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false)
  const [showUrlDialog, setShowUrlDialog] = useState(false)
  const [urlInput, setUrlInput] = useState('')

  // Command Menu state (rich "+" palette)
  const [showCommandMenu, setShowCommandMenu] = useState(false)
  const [commandMenuSubmenu, setCommandMenuSubmenu] = useState<'none' | 'mcp' | 'tools' | 'slash'>('none')
  const commandMenuRef = useRef<HTMLDivElement>(null)

  // Feature toggles (persisted per-project in localStorage)
  const [webSearchEnabled, setWebSearchEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('pipilot-web-search-enabled')
        return stored !== null ? JSON.parse(stored) : true
      } catch { return true }
    }
    return true
  })
  const [imageGenEnabled, setImageGenEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('pipilot-image-gen-enabled')
        return stored !== null ? JSON.parse(stored) : true
      } catch { return true }
    }
    return true
  })

  // MCP server toggles (per-session runtime toggles)
  const [mcpServerToggles, setMcpServerToggles] = useState<Record<string, boolean>>({})
  const [loadedMcpServers, setLoadedMcpServers] = useState<MCPServerConfig[]>([])

  // Tool category toggles
  const [toolCategoryToggles, setToolCategoryToggles] = useState<Record<string, boolean>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const toolPrefs = localStorage.getItem('pipilot-tool-preferences')
        if (toolPrefs) {
          const parsed = JSON.parse(toolPrefs)
          const disabledCats = parsed.disabledCategories || []
          const toggles: Record<string, boolean> = {}
          const allCats = ['file_ops', 'code_search', 'web_tools', 'dev_tools', 'pipilot_db', 'supabase', 'stripe', 'docs_quality', 'image_gen']
          allCats.forEach(cat => { toggles[cat] = !disabledCats.includes(cat) })
          return toggles
        }
      } catch {}
    }
    return { file_ops: true, code_search: true, web_tools: true, dev_tools: true, pipilot_db: true, supabase: true, stripe: true, docs_quality: true, image_gen: true }
  })

  // Client-side tool map (mirrors server categoryToolMap)
  const clientCategoryToolMap: Record<string, { name: string; label: string }[]> = {
    file_ops: [
      { name: 'write_file', label: 'Write File' },
      { name: 'read_file', label: 'Read File' },
      { name: 'edit_file', label: 'Edit File' },
      { name: 'delete_file', label: 'Delete File' },
      { name: 'delete_folder', label: 'Delete Folder' },
      { name: 'client_replace_string_in_file', label: 'Find & Replace' },
    ],
    code_search: [
      { name: 'grep_search', label: 'Grep Search' },
      { name: 'semantic_code_navigator', label: 'Semantic Navigator' },
      { name: 'list_files', label: 'List Files' },
    ],
    web_tools: [
      { name: 'web_search', label: 'Web Search' },
      { name: 'web_extract', label: 'Web Extract' },
    ],
    dev_tools: [
      { name: 'check_dev_errors', label: 'Check Dev Errors' },
      { name: 'node_machine', label: 'Node Machine' },
      { name: 'remove_package', label: 'Remove Package' },
    ],
    pipilot_db: [
      { name: 'pipilotdb_create_database', label: 'Create Database' },
      { name: 'pipilotdb_create_table', label: 'Create Table' },
      { name: 'pipilotdb_query_database', label: 'Query Database' },
      { name: 'pipilotdb_manipulate_table_data', label: 'Manipulate Data' },
      { name: 'pipilotdb_manage_api_keys', label: 'Manage API Keys' },
      { name: 'pipilotdb_list_tables', label: 'List Tables' },
      { name: 'pipilotdb_read_table', label: 'Read Table' },
      { name: 'pipilotdb_delete_table', label: 'Delete Table' },
    ],
    supabase: [
      { name: 'supabase_fetch_api_keys', label: 'Fetch API Keys' },
      { name: 'supabase_create_table', label: 'Create Table' },
      { name: 'supabase_insert_data', label: 'Insert Data' },
      { name: 'supabase_delete_data', label: 'Delete Data' },
      { name: 'supabase_read_table', label: 'Read Table' },
      { name: 'supabase_drop_table', label: 'Drop Table' },
      { name: 'supabase_execute_sql', label: 'Execute SQL' },
      { name: 'supabase_list_tables_rls', label: 'List Tables & RLS' },
      { name: 'request_supabase_connection', label: 'Request Connection' },
    ],
    stripe: [
      { name: 'stripe_validate_key', label: 'Validate Key' },
      { name: 'stripe_list_products', label: 'List Products' },
      { name: 'stripe_create_product', label: 'Create Product' },
      { name: 'stripe_update_product', label: 'Update Product' },
      { name: 'stripe_delete_product', label: 'Delete Product' },
      { name: 'stripe_list_prices', label: 'List Prices' },
      { name: 'stripe_create_price', label: 'Create Price' },
      { name: 'stripe_update_price', label: 'Update Price' },
      { name: 'stripe_list_customers', label: 'List Customers' },
      { name: 'stripe_create_customer', label: 'Create Customer' },
      { name: 'stripe_update_customer', label: 'Update Customer' },
      { name: 'stripe_delete_customer', label: 'Delete Customer' },
      { name: 'stripe_create_payment_intent', label: 'Create Payment' },
      { name: 'stripe_update_payment_intent', label: 'Update Payment' },
      { name: 'stripe_cancel_payment_intent', label: 'Cancel Payment' },
      { name: 'stripe_list_charges', label: 'List Charges' },
      { name: 'stripe_list_subscriptions', label: 'List Subscriptions' },
      { name: 'stripe_update_subscription', label: 'Update Subscription' },
      { name: 'stripe_cancel_subscription', label: 'Cancel Subscription' },
      { name: 'stripe_list_coupons', label: 'List Coupons' },
      { name: 'stripe_create_coupon', label: 'Create Coupon' },
      { name: 'stripe_update_coupon', label: 'Update Coupon' },
      { name: 'stripe_delete_coupon', label: 'Delete Coupon' },
      { name: 'stripe_create_refund', label: 'Create Refund' },
      { name: 'stripe_search', label: 'Search' },
    ],
    docs_quality: [
      { name: 'generate_report', label: 'Generate Report' },
      { name: 'pipilot_get_docs', label: 'Get Docs' },
      { name: 'auto_documentation', label: 'Auto Documentation' },
      { name: 'code_review', label: 'Code Review' },
      { name: 'code_quality_analysis', label: 'Code Quality' },
    ],
    image_gen: [
      { name: 'generate_image', label: 'Generate Image' },
    ],
  }

  // Individual tool toggles (persisted)
  const [disabledIndividualTools, setDisabledIndividualTools] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const toolPrefs = localStorage.getItem('pipilot-tool-preferences')
        if (toolPrefs) {
          const parsed = JSON.parse(toolPrefs)
          return parsed.disabledTools || []
        }
      } catch {}
    }
    return []
  })

  // Which category is drilled-down in tool submenu
  const [toolDetailCategory, setToolDetailCategory] = useState<string | null>(null)

  // Speech-to-text state (Web Speech API real-time implementation)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const recognitionRef = useRef<any>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const fileLookupServiceRef = useRef<FileLookupService | null>(null)

  // Load project files for context
  const [projectFiles, setProjectFiles] = useState<any[]>([])

  // Database ID state - loaded from workspace if not provided
  const [databaseId, setDatabaseId] = useState<number | null>(project?.databaseId || null)

  // Local state for input (not using useChat's input)
  const [input, setInput] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('chat-panel-input') || ''
    }
    return ''
  })
  const [isLoading, setIsLoading] = useState(false)
  const [continuingMessageId, setContinuingMessageId] = useState<string | null>(null)
  const [isContinuationInProgress, setIsContinuationInProgress] = useState(false)
  const isContinuationInProgressRef = useRef(false)

  // Broadcast AI streaming state to other panels (e.g. preview panel)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ai-streaming-state', {
        detail: { isStreaming: isLoading }
      }))
    }
  }, [isLoading])

  // Process prompt queue when AI finishes loading
  useEffect(() => {
    if (!isLoading && promptQueueRef.current.length > 0 && !isProcessingQueueRef.current) {
      isProcessingQueueRef.current = true
      const nextItem = promptQueueRef.current[0]
      // Small delay to let the UI settle after previous response
      const timer = setTimeout(() => {
        setPromptQueue(prev => prev.slice(1))
        setInput(nextItem.text)
        // Trigger submit after input is set
        setTimeout(() => {
          const form = document.querySelector('form[data-chat-form]') as HTMLFormElement
          if (form) {
            form.requestSubmit()
          }
          isProcessingQueueRef.current = false
        }, 100)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [isLoading])

  // Chat mode state - true for Plan mode, false for Agent mode
  const [isAskMode, setIsAskMode] = useState(false)

  // Prompt Queue - queue messages when AI is busy, persist to localStorage
  const [promptQueue, setPromptQueue] = useState<Array<{ id: string; text: string; timestamp: number }>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('pipilot-prompt-queue')
        return stored ? JSON.parse(stored) : []
      } catch { return [] }
    }
    return []
  })
  const promptQueueRef = useRef(promptQueue)
  promptQueueRef.current = promptQueue
  const isProcessingQueueRef = useRef(false)

  // Persist prompt queue to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('pipilot-prompt-queue', JSON.stringify(promptQueue))
    }
  }, [promptQueue])

  // Load MCP servers for command menu display
  useEffect(() => {
    if (typeof window === 'undefined') return
    const servers: MCPServerConfig[] = []
    try {
      const globalStored = localStorage.getItem('pipilot-mcp-servers-global')
      if (globalStored) servers.push(...JSON.parse(globalStored))
    } catch {}
    if (project?.id) {
      try {
        const stored = localStorage.getItem(`pipilot-mcp-servers-${project.id}`)
        if (stored) servers.push(...JSON.parse(stored))
      } catch {}
    }
    setLoadedMcpServers(servers)
    // Initialize toggles from existing enabled state
    const toggles: Record<string, boolean> = {}
    servers.forEach(s => { toggles[s.id || s.name] = s.enabled !== false })
    setMcpServerToggles(toggles)
  }, [project?.id])

  // Persist feature toggles
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('pipilot-web-search-enabled', JSON.stringify(webSearchEnabled))
    }
  }, [webSearchEnabled])
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('pipilot-image-gen-enabled', JSON.stringify(imageGenEnabled))
    }
  }, [imageGenEnabled])

  // Persist tool category toggles + individual tool toggles
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const disabledCategories = Object.entries(toolCategoryToggles)
        .filter(([, enabled]) => !enabled)
        .map(([cat]) => cat)
      localStorage.setItem('pipilot-tool-preferences', JSON.stringify({ disabledCategories, disabledTools: disabledIndividualTools }))
    }
  }, [toolCategoryToggles, disabledIndividualTools])

  // Close command menu on outside click
  useEffect(() => {
    if (!showCommandMenu) return
    const handleClickOutside = (e: MouseEvent) => {
      if (commandMenuRef.current && !commandMenuRef.current.contains(e.target as Node)) {
        setShowCommandMenu(false)
        setCommandMenuSubmenu('none')
        setToolDetailCategory(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showCommandMenu])

  const addToQueue = useCallback((text: string) => {
    setPromptQueue(prev => [...prev, { id: Date.now().toString(), text, timestamp: Date.now() }])
  }, [])

  const removeFromQueue = useCallback((id: string) => {
    setPromptQueue(prev => prev.filter(item => item.id !== id))
  }, [])

  const clearQueue = useCallback(() => {
    setPromptQueue([])
  }, [])

  // Supabase token management - automatic refresh
  const { token: supabaseToken, isLoading: tokenLoading, isExpired: tokenExpired, error: tokenError } = useSupabaseToken()

  // Tool invocations tracking for inline pills
  // textPosition tracks where in the text stream the tool was called (for inline rendering)
  // reasoningPosition tracks where in the reasoning stream the tool was called
  const [activeToolCalls, setActiveToolCalls] = useState<Map<string, Array<{
    toolName: string
    toolCallId: string
    input?: any
    status: 'executing' | 'completed' | 'failed'
    textPosition?: number // Character position in text when tool was called
    reasoningPosition?: number // Character position in reasoning when tool was called
  }>>>(new Map())

  // ABE Credit balance state
  const [creditBalance, setCreditBalance] = useState<number | null>(null)
  const [currentPlan, setCurrentPlan] = useState<string>('free')
  const [loadingCredits, setLoadingCredits] = useState(true)
  const [showTopUpDialog, setShowTopUpDialog] = useState(false)
  const [topUpAmount, setTopUpAmount] = useState('10')
  const [processingTopUp, setProcessingTopUp] = useState(false)
  const [showCreditExhaustionModal, setShowCreditExhaustionModal] = useState(false)

  // Auto-adjust textarea height on input change
  useEffect(() => {
    if (textareaRef.current) {
      debouncedHeightAdjustment(textareaRef.current)
    }
  }, [input, debouncedHeightAdjustment])

  // Local state for messages (since we're not using useChat hook for complex attachment handling)
  const [messages, setMessages] = useState<any[]>([])
  const [error, setError] = useState<Error | null>(null)
  const [abortController, setAbortController] = useState<AbortController | null>(null)

  // Streaming progress state - accessible by handleStop
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null)
  const [streamingContent, setStreamingContent] = useState<string>('')
  const [streamingReasoning, setStreamingReasoning] = useState<string>('')
  const [streamingToolCalls, setStreamingToolCalls] = useState<any[]>([])

  // Message actions state
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingMessageContent, setEditingMessageContent] = useState('')

  // New feature states
  const slashCommands = useSlashCommands()
  const [showVoicePanel, setShowVoicePanel] = useState(false)
  const [showDiffPreview, setShowDiffPreview] = useState(false)
  const [pendingFileChanges, setPendingFileChanges] = useState<FileChange[]>([])
  const [conversationBranches, setConversationBranches] = useState<ConversationBranch[]>([])
  const [currentBranchId, setCurrentBranchId] = useState<string | null>(null)
  const [toolExecutions, setToolExecutions] = useState<ToolExecution[]>([])
  const [elapsedTime, setElapsedTime] = useState(0)
  const [currentChatSessionId, setCurrentChatSessionId] = useState<string | null>(null)

  // Stream recovery state - for recovering interrupted streams
  const [interruptedStream, setInterruptedStream] = useState<InterruptedStream | null>(null)
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false)
  const currentStreamIdRef = useRef<string | null>(null) // Track current stream for visibility change handler

  // Branch dialog state
  const [showBranchDialog, setShowBranchDialog] = useState(false)
  const [branchingMessageId, setBranchingMessageId] = useState<string | null>(null)

  // Memory display dialog state
  const [showMemoryDialog, setShowMemoryDialog] = useState(false)

  // Search dialog state
  const [showSearchDialog, setShowSearchDialog] = useState(false)
  const [attachedSearchContexts, setAttachedSearchContexts] = useState<AttachedSearchContext[]>([])

  // Load database ID from workspace if not provided
  // Try multiple methods for maximum accuracy
  // CRITICAL: Always re-check when URL or project changes to handle navigation scenarios
  useEffect(() => {
    const loadDatabaseId = async () => {
      try {
        // Method 1: Try to get from URL parameters (most accurate for current context)
        // This handles cases like ?newProject=xxx&projectId=xxx correctly
        let dbId = await getDatabaseIdFromUrl();

        // Method 2: If URL method fails, fall back to project.id
        if (!dbId && project?.id) {
          dbId = await getWorkspaceDatabaseId(project.id);
        }

        // Update database ID if we found one (or clear it if not found)
        if (dbId !== databaseId) {
          setDatabaseId(dbId);
          if (dbId) {
            console.log(`[ChatPanelV2] ✅ Loaded database ID ${dbId} for workspace ${project?.id || 'from URL'}`);
          } else {
            console.warn('[ChatPanelV2] ⚠️ No database ID found for this workspace');
          }
        }
      } catch (error) {
        console.error('[ChatPanelV2] ❌ Failed to load database ID:', error);
      }
    };

    loadDatabaseId();
    // IMPORTANT: Removed databaseId from deps to allow re-fetching when URL changes
    // This fixes the bug where navigation with different URL params doesn't trigger reload
  }, [project?.id, typeof window !== 'undefined' ? window.location.search : '']);

  // Save message to IndexedDB for the current project
  const saveMessageToIndexedDB = async (message: any) => {
    if (!project) {
      console.warn('[ChatPanelV2] Cannot save message: no project selected')
      return
    }

    try {
      console.log(`[ChatPanelV2] Saving message to project ${project.id}:`, {
        id: message.id,
        role: message.role,
        contentLength: message.content.length,
        hasReasoning: !!message.reasoning,
        reasoningLength: message.reasoning?.length || 0,
        hasTools: message.toolInvocations?.length > 0,
        toolCount: message.toolInvocations?.length || 0,
        metadataKeys: Object.keys(message.metadata || {})
      })
      const { storageManager } = await import('@/lib/storage-manager')
      await storageManager.init()

      // Get or create chat session for this project
      let chatSessions = await storageManager.getChatSessions(project.userId)
      let chatSession = chatSessions.find((session: any) =>
        session.workspaceId === project.id && session.isActive
      )

      if (!chatSession) {
        console.log(`[ChatPanelV2] Creating new chat session for project ${project.id}`)
        const sessionTitle = project.name ? `${project.name} Chat` : `Project Chat Session`
        chatSession = await storageManager.createChatSession({
          workspaceId: project.id,
          userId: project.userId,
          title: sessionTitle,
          isActive: true,
          lastMessageAt: new Date().toISOString()
        })
        console.log(`[ChatPanelV2] Created chat session:`, chatSession.id)
      }

      // Check if message with this ID already exists and delete it (to prevent duplicates)
      const existingMessages = await storageManager.getMessages(chatSession.id)
      const existingMessage = existingMessages.find((m: any) => m.id === message.id)

      if (existingMessage) {
        console.log(`[ChatPanelV2] Deleting existing message with ID ${message.id} to prevent duplicates`)
        await storageManager.deleteMessage(chatSession.id, message.id)
      }

      // Create the message (fresh or replacement)
      await storageManager.createMessage({
        chatSessionId: chatSession.id,
        role: message.role,
        content: message.content,
        metadata: message.metadata || {},
        tokensUsed: 0
      })
      // Update session's last message time and message count
      const messageCount = existingMessages.length + 1
      await storageManager.updateChatSession(chatSession.id, {
        lastMessageAt: new Date().toISOString(),
        messageCount: messageCount
      })

      console.log(`[ChatPanelV2] Message saved successfully for project ${project.id}`)
    } catch (error) {
      console.error(`[ChatPanelV2] Error saving message for project ${project?.id}:`, error)
    }
  }

  // Save assistant message after streaming is complete
  const saveAssistantMessageAfterStreaming = async (
    assistantMessageId: string,
    accumulatedContent: string,
    accumulatedReasoning: string,
    accumulatedToolInvocations: any[]
  ) => {
    if (!project) {
      console.warn('[ChatPanelV2] Cannot save assistant message: no project selected')
      return
    }

    try {
      console.log(`[ChatPanelV2] Saving complete assistant message after streaming: ${assistantMessageId}`)

      // Get start time from the message metadata (more reliable than Map)
      const messageInState = messages.find(m => m.id === assistantMessageId)
      const startTime = messageInState?.metadata?.startTime

      console.log(`[ChatPanelV2] 🔍 Looking up start time from message:`, {
        assistantMessageId,
        foundMessage: !!messageInState,
        startTime,
        hasStartTime: startTime !== undefined
      })

      // Calculate duration from start time
      const elapsedSeconds = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0

      console.log(`[ChatPanelV2] Duration calculation:`, {
        assistantMessageId,
        startTime,
        now: Date.now(),
        elapsedSeconds,
        hasStartTime: startTime !== undefined,
        messagesLength: messages.length
      })

      const finalAssistantMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: accumulatedContent || (accumulatedToolInvocations.length > 0 ? 'Task completed successfully!.' : ''),
        createdAt: new Date().toISOString(),
        metadata: {
          toolInvocations: accumulatedToolInvocations,
          reasoning: accumulatedReasoning,
          hasToolCalls: accumulatedToolInvocations.length > 0,
          durationSeconds: elapsedSeconds  // Save the actual elapsed time
        }
      }

      console.log(`[ChatPanelV2] Saving message with metadata:`, {
        id: assistantMessageId,
        metadataKeys: Object.keys(finalAssistantMessage.metadata),
        durationSeconds: finalAssistantMessage.metadata.durationSeconds
      })

      await saveMessageToIndexedDB(finalAssistantMessage)
      console.log(`[ChatPanelV2] Complete assistant message saved to database: ${assistantMessageId}, duration: ${elapsedSeconds}s`)
      
      // Clear streaming state after successful save
      setStreamingMessageId(null)
      setStreamingContent('')
      setStreamingReasoning('')
      setStreamingToolCalls([])

      // Dispatch event to switch to preview tab and trigger auto-preview creation
      // This creates the illusion of "hot reload" after AI code generation
      // Skip in Ask mode since no file changes are made
      // In Agent mode, only dispatch if file modification tools were actually used
      const hasFileModifications = accumulatedToolInvocations.some(
        (tool: any) => ['edit_file', 'write_file', 'delete_file', 'client_replace_string_in_file'].includes(tool.toolName)
      )

      if (typeof window !== 'undefined' && !isAskMode && hasFileModifications) {
        console.log('[ChatPanelV2] Dispatching auto-preview event after streaming completion (file modifications detected)')
        window.dispatchEvent(new CustomEvent('ai-stream-complete', {
          detail: {
            projectId: project.id,
            shouldSwitchToPreview: true,
            shouldCreatePreview: true
          }
        }))
      } else if (!isAskMode && !hasFileModifications) {
        console.log('[ChatPanelV2] Skipping auto-preview event (no file modifications detected)')
      }
    } catch (error) {
      console.error(`[ChatPanelV2] Error saving complete assistant message ${assistantMessageId}:`, error)
    }
  }

  // Lightweight regex-based @ command detection
  // This uses a small RegExp to find an `@` that is at line start or preceded by whitespace
  // and captures the following token (up to whitespace). It's synchronous and cheap.
  const detectAtCommand = (text: string, cursorPosition: number) => {
    // Only search up to cursorPosition to avoid scanning the whole string repeatedly
    const snippet = text.substring(0, cursorPosition);
    // Regex: match last occurrence of '@' that is start-of-line or preceded by whitespace
    // and capture following non-whitespace token
    const re = /(?:^|\s)@([\S]*)$/;
    const match = snippet.match(re);
    if (!match) return null;

    const query = match[1] || '';
    const atIndex = snippet.lastIndexOf('@');
    return {
      startIndex: atIndex,
      endIndex: atIndex + 1 + query.length,
      query
    };
  };

  const calculateDropdownPosition = (textarea: HTMLTextAreaElement, atIndex: number) => {
    const rect = textarea.getBoundingClientRect();
    const dropdownHeight = 320;
    const viewportHeight = window.innerHeight;
    const spaceAbove = rect.top;
    const spaceBelow = viewportHeight - rect.bottom;

    let top: number;
    if (spaceAbove >= dropdownHeight + 16) {
      top = rect.top - dropdownHeight - 8;
    } else if (spaceBelow >= dropdownHeight + 16) {
      top = rect.bottom + 8;
    } else {
      top = Math.max(16, rect.top - dropdownHeight - 8);
    }

    const left = rect.left;
    return { top, left };
  };

  const handleFileSelect = (file: FileSearchResult) => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const cursorPos = textarea.selectionStart;
    const atCommand = detectAtCommand(input, cursorPos);

    if (atCommand) {
      const before = input.substring(0, atCommand.startIndex);
      const after = input.substring(atCommand.endIndex);
      const replacement = `@${file.name}`;

      setInput(before + replacement + after);
      setAttachedFiles(prev => [...prev, file]);

      setTimeout(() => {
        if (textareaRef.current) {
          const newCursorPos = before.length + replacement.length;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    }

    closeFileDropdown();
  };

  const closeFileDropdown = () => {
    setShowFileDropdown(false);
    setFileQuery('');
    setAtCommandStartIndex(-1);
  };

  // Checkpoint handlers
  const handleRevertToCheckpoint = async (messageId: string) => {
    if (!project || isReverting) return

    if (restoreMessageId === messageId) {
      await handleRestoreForMessage(messageId);
      return;
    }

    setRevertMessageId(messageId)
    setShowRevertDialog(true)
  }

  const handleRestoreForMessage = async (messageId: string) => {
    if (!project) return

    try {
      const { isRestoreAvailableForMessage, restorePreRevertState } = await import('@/lib/checkpoint-utils')

      if (!isRestoreAvailableForMessage(project.id, messageId)) {
        toast({
          title: "Restore Unavailable",
          description: "The restore option is only available for 5 minutes after reverting.",
          variant: "destructive"
        })
        setRestoreMessageId(null)
        return
      }

      // Show restoring progress toast
      const { dismiss: dismissRestoring } = toast({
        title: "Restoring...",
        description: (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Restoring files and messages. Please wait...</span>
          </div>
        ),
        duration: Infinity
      })

      const { storageManager } = await import('@/lib/storage-manager')
      await storageManager.init()

      const chatSessions = await storageManager.getChatSessions(project.userId)
      const activeSession = chatSessions.find((session: any) =>
        session.workspaceId === project.id && session.isActive
      )

      if (!activeSession) {
        dismissRestoring()
        toast({
          title: "Restore Failed",
          description: "Could not find chat session for this project.",
          variant: "destructive"
        })
        return
      }

      const success = await restorePreRevertState(project.id, activeSession.id, messageId)

      // Dismiss the restoring toast
      dismissRestoring()

      if (success) {
        await loadMessages()

        window.dispatchEvent(new CustomEvent('files-changed', {
          detail: { projectId: project.id, forceRefresh: true }
        }))

        setRestoreMessageId(null)

        toast({
          title: "✓ Restored Successfully",
          description: "All files and messages have been restored to their previous state.",
          duration: 5000
        })
      } else {
        toast({
          title: "Restore Failed",
          description: "Failed to restore files and messages.",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error('[Checkpoint] Error restoring for message:', error)
      toast({
        title: "Restore Failed",
        description: error instanceof Error ? error.message : "An unknown error occurred.",
        variant: "destructive"
      })
    }
  }

  // Confirm revert with robust checkpoint finding and state management
  const confirmRevert = async () => {
    if (!project || !revertMessageId) return

    setIsReverting(true)
    setShowRevertDialog(false)

    // Show reverting progress toast
    const { dismiss: dismissReverting } = toast({
      title: "Reverting...",
      description: (
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Restoring files and clearing messages. Please wait...</span>
        </div>
      ),
      duration: Infinity
    })

    try {
      // Get the chat session for this project
      const { storageManager } = await import('@/lib/storage-manager')
      await storageManager.init()

      const chatSessions = await storageManager.getChatSessions(project.userId)
      const activeSession = chatSessions.find((session: any) =>
        session.workspaceId === project.id && session.isActive
      )

      if (!activeSession) {
        dismissReverting()
        toast({
          title: "Revert Failed",
          description: "Could not find chat session for this project.",
          variant: "destructive"
        })
        setIsReverting(false)
        setRevertMessageId(null)
        return
      }

      // Capture the current state before revert for potential restore
      const { capturePreRevertState } = await import('@/lib/checkpoint-utils')
      await capturePreRevertState(project.id, activeSession.id, revertMessageId)

      // Get all checkpoints for this workspace
      const { getCheckpoints } = await import('@/lib/checkpoint-utils')
      const checkpoints = await getCheckpoints(project.id)

      // Find the checkpoint associated with this message
      let checkpoint = checkpoints.find(cp => cp.messageId === revertMessageId) || undefined

      if (!checkpoint) {
        // Try to find checkpoint by timestamp if message ID doesn't match
        // This handles cases where message ID might not match due to timing issues
        const allMessages = await storageManager.getMessages(activeSession.id)
        const targetMessage = allMessages.find(msg => msg.id === revertMessageId)

        if (targetMessage) {
          // Find checkpoint closest to message creation time
          const targetTime = new Date(targetMessage.createdAt).getTime()
          const foundCheckpoint = checkpoints.find(cp => {
            const checkpointTime = new Date(cp.createdAt).getTime()
            const timeDiff = Math.abs(checkpointTime - targetTime)
            return timeDiff <= 2000 // 2 seconds tolerance
          });

          if (foundCheckpoint) {
            checkpoint = foundCheckpoint;
          }
        }

        if (!checkpoint) {
          dismissReverting()
          toast({
            title: "Revert Failed",
            description: "Could not find checkpoint for this message. This might happen if the message is too recent or if there was a timing issue.",
            variant: "destructive"
          })
          setIsReverting(false)
          setRevertMessageId(null)
          return
        }
      }

      // Get all messages in the session
      const allMessages = await storageManager.getMessages(activeSession.id)

      // Try to find the message by ID first
      let revertMessageIndex = allMessages.findIndex(msg => msg.id === revertMessageId)
      let revertTimestamp = ''
      let revertMessage = null

      if (revertMessageIndex !== -1) {
        // Found the message by ID
        revertMessage = allMessages[revertMessageIndex]
        revertTimestamp = revertMessage.createdAt
        console.log(`[Checkpoint] Found message by ID: ${revertMessageId}`)
      } else {
        // Log detailed information for debugging
        console.log(`[Checkpoint] Message not found by ID: ${revertMessageId}`)
        console.log(`[Checkpoint] Available messages:`, allMessages.map(msg => ({
          id: msg.id,
          content: msg.content.substring(0, 50) + '...',
          createdAt: msg.createdAt
        })))

        // If we can't find by ID, try to find by checkpoint creation time
        // This handles cases where the message hasn't been saved to DB yet or there's a timing issue
        const checkpointTime = new Date(checkpoint.createdAt).getTime()
        console.log(`[Checkpoint] Looking for message near checkpoint time: ${checkpoint.createdAt} (${checkpointTime})`)

        // Find the message closest to the checkpoint creation time
        revertMessageIndex = allMessages.findIndex(msg => {
          const msgTime = new Date(msg.createdAt).getTime()
          // Allow for a small time difference (2 seconds) to account for timing issues
          const timeDiff = Math.abs(msgTime - checkpointTime)
          console.log(`[Checkpoint] Message ${msg.id} time diff: ${timeDiff}ms`)
          return timeDiff <= 2000
        })

        if (revertMessageIndex !== -1) {
          // Found a message close to checkpoint time
          revertMessage = allMessages[revertMessageIndex]
          revertTimestamp = revertMessage.createdAt
          console.log(`[Checkpoint] Found message by timestamp: ${revertMessage.id}`)
        } else {
          // Last resort: use the checkpoint creation time as the timestamp
          revertTimestamp = checkpoint.createdAt
          console.log(`[Checkpoint] Using checkpoint timestamp as fallback: ${revertTimestamp}`)
        }
      }

      if (!revertTimestamp) {
        dismissReverting()
        toast({
          title: "Revert Failed",
          description: "Could not determine the timestamp for the selected message.",
          variant: "destructive"
        })
        setIsReverting(false)
        setRevertMessageId(null)
        return
      }

      // Delete messages that came after this timestamp
      const { deleteMessagesAfter } = await import('@/lib/checkpoint-utils')
      const deletedCount = await deleteMessagesAfter(activeSession.id, revertTimestamp)
      console.log(`[Checkpoint] Deleted ${deletedCount} messages after timestamp ${revertTimestamp}`)

      // Update the messages state to remove messages after the revert point
      // First, we'll update the UI immediately for better UX
      setMessages(prevMessages => {
        // If we found the message by ID, slice up to and including that message
        const index = prevMessages.findIndex(msg => msg.id === revertMessageId)
        if (index !== -1) {
          return prevMessages.slice(0, index + 1)
        }
        // If we couldn't find by ID, we'll reload after the restore completes
        return prevMessages
      })

      // Restore the checkpoint
      const { restoreCheckpoint } = await import('@/lib/checkpoint-utils')
      const success = await restoreCheckpoint(checkpoint.id)

      if (success) {
        // Force refresh the file explorer
        window.dispatchEvent(new CustomEvent('files-changed', {
          detail: { projectId: project.id, forceRefresh: true }
        }))

        // Small delay to ensure UI updates properly
        await new Promise(resolve => setTimeout(resolve, 100))

        // Reload messages to ensure consistency between UI and database
        // This also helps avoid "Node cannot be found" errors
        await loadMessages()

        // Set this message to show restore icon
        setRestoreMessageId(revertMessageId)

        // Populate the input area with the reverted message content for editing
        if (revertMessage) {
          setInput(revertMessage.content)
        }

        // Dismiss the reverting toast
        dismissReverting()

        // Show success toast with restore information
        toast({
          title: "✓ Reverted Successfully",
          description: (
            <div className="space-y-2">
              <p>Files and messages have been restored to this version.</p>
              <p className="text-sm text-muted-foreground">
                💡 You can restore back within 5 minutes using the restore icon on this message.
              </p>
            </div>
          ),
          duration: 10000 // 10 seconds for user to read
        })
      } else {
        // Dismiss the reverting toast
        dismissReverting()

        // Reload messages if file restoration failed
        await loadMessages()
        toast({
          title: "Revert Failed",
          description: "Failed to restore files to this version.",
          variant: "destructive"
        })
      }
    } catch (error) {
      // Dismiss the reverting toast on error
      dismissReverting()

      console.error('[Checkpoint] Error reverting to checkpoint:', error)
      // Reload messages on error
      if (project) {
        await loadMessages()
      }
      toast({
        title: "Revert Failed",
        description: error instanceof Error ? error.message : "An unknown error occurred.",
        variant: "destructive"
      })
    } finally {
      setIsReverting(false)
      setRevertMessageId(null)
    }
  }

  const cancelRevert = () => {
    setShowRevertDialog(false)
    setRevertMessageId(null)
  }

  // Handle credit top-up
  const handleTopUp = async () => {
    const amount = parseFloat(topUpAmount)
    if (isNaN(amount) || amount < 1 || amount > 1000) {
      toast({
        title: 'Invalid amount',
        description: 'Amount must be between $1 and $1000',
        variant: 'destructive'
      })
      return
    }

    // Check if user can purchase credits
    const { canPurchaseCredits } = await import('@/lib/stripe-config')
    if (!canPurchaseCredits(currentPlan)) {
      toast({
        title: 'Upgrade required',
        description: 'Credit purchases are only available for paid plans.',
        variant: 'destructive'
      })
      return
    }

    setProcessingTopUp(true)

    try {
      const response = await fetch('/api/stripe/purchase-credits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          credits: Math.floor(amount), // Convert dollars to credits (1:1 ratio)
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create credit purchase session')
      }

      const { url } = await response.json()
      window.location.href = url
    } catch (error) {
      console.error('Error creating credit purchase session:', error)
      toast({
        title: 'Purchase failed',
        description: 'Failed to start credit purchase. Please try again.',
        variant: 'destructive'
      })
    } finally {
      setProcessingTopUp(false)
    }
  }

  // Message action handlers
  const handleCopyMessage = async (messageId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      toast({
        title: 'Copied',
        description: 'Message copied to clipboard'
      })
    } catch (err) {
      console.error('Copy failed', err)
      toast({
        title: 'Copy failed',
        description: 'Unable to copy message',
        variant: 'destructive'
      })
    }
  }

  const handleDeleteMessage = async (messageId: string) => {
    if (!project) return

    try {
      // Remove message from UI immediately for better UX
      setMessages(prev => prev.filter(msg => msg.id !== messageId))

      // Remove tool calls for this message
      setActiveToolCalls(prev => {
        const newMap = new Map(prev)
        newMap.delete(messageId)
        return newMap
      })

      // Delete message from IndexedDB
      const { storageManager } = await import('@/lib/storage-manager')
      await storageManager.init()

      // Get chat session for this project
      const chatSessions = await storageManager.getChatSessions(project.userId)
      const activeSession = chatSessions.find((session: any) =>
        session.workspaceId === project.id && session.isActive
      )

      if (activeSession) {
        // Delete the message from the database
        const success = await storageManager.deleteMessage(activeSession.id, messageId)
        if (success) {
          console.log(`[ChatPanelV2] Deleted message ${messageId} from database`)
        } else {
          console.warn(`[ChatPanelV2] Failed to delete message ${messageId} from database`)
        }
      }

      toast({
        title: "Message Deleted",
        description: "The message has been removed from the chat history."
      })
    } catch (error) {
      console.error('[ChatPanelV2] Error deleting message:', error)
      toast({
        title: "Delete Failed",
        description: "Failed to delete the message. Please try again.",
        variant: "destructive"
      })

      // Reload messages on error to maintain consistency
      if (project) {
        await loadProjectFiles()
      }
    }
  }

  const handleRetryMessage = async (messageId: string, content: string) => {
    if (!project || isLoading) return

    // Find the message being retried
    const messageToRetry = messages.find(msg => msg.id === messageId)
    if (!messageToRetry) return

    // Clear all messages that came after this message (including AI responses)
    const messageIndex = messages.findIndex(msg => msg.id === messageId)
    if (messageIndex !== -1) {
      setMessages(prev => prev.slice(0, messageIndex + 1))
    }

    // Set the content as input and submit fresh
    setInput(content)
    // Note: Don't set isLoading here - handleEnhancedSubmit will handle it

    // Small delay to ensure state is updated
    setTimeout(() => {
      // Create a synthetic form event to trigger handleEnhancedSubmit
      const syntheticEvent = {
        preventDefault: () => { },
      } as React.FormEvent

      handleEnhancedSubmit(syntheticEvent)
    }, 100)
  }

  const handleSaveEdit = async () => {
    if (!editingMessageId || !project) return

    try {
      // Update the message in local state
      setMessages(prev => prev.map(msg =>
        msg.id === editingMessageId
          ? { ...msg, content: editingMessageContent }
          : msg
      ))

      toast({
        title: "Message Updated",
        description: "The message has been updated successfully."
      })
    } catch (error) {
      console.error('[ChatPanelV2] Error updating message:', error)
      toast({
        title: "Update Failed",
        description: "Failed to update the message. Please try again.",
        variant: "destructive"
      })
    } finally {
      // Reset edit mode
      setEditingMessageId(null)
      setEditingMessageContent('')
      setInput('')
    }
  }

  const handleCancelEdit = () => {
    setEditingMessageId(null)
    setEditingMessageContent('')
    setInput('')
  }

  // Handle stream continuation - automatically create new request with continuation state
  const handleStreamContinuation = async (
    continuationState: any,
    originalAssistantMessageId: string,
    accumulatedContent: string,
    accumulatedReasoning: string
  ) => {
    if (!continuationState || !project) {
      console.error('[ChatPanelV2][Continuation] Invalid continuation state or no project')
      return
    }

    console.log('[ChatPanelV2][Continuation] 🚀 Starting automatic continuation request')

    // Set the message as continuing to show streaming indicator
    setContinuingMessageId(originalAssistantMessageId)

    // Set loading state to keep the spinner visible during continuation
    setIsLoading(true)
    setIsContinuationInProgress(true)

    try {
      // During continuation, the message will continue streaming seamlessly
      // No need to modify the message content - the existing streaming indicator will show

      // Continue appending to the original assistant message instead of creating new one
      // Remove the thinking indicator and continue with content
      setMessages(prev => prev.map(msg =>
        msg.id === originalAssistantMessageId
          ? {
            ...msg,
            content: accumulatedContent, // Remove thinking indicator
            reasoning: accumulatedReasoning
          }
          : msg
      ))

      // Create abort controller for continuation request
      const continuationController = new AbortController()
      setAbortController(continuationController)

      // Prepare continuation request payload
      // Include accumulated content so AI knows where it left off and can continue seamlessly
      const continuationPayload = {
        messages: [], // Don't send messages - full history is in continuationState
        projectId: project.id,
        project,
        databaseId, // Pass database ID from state (loaded from workspace)
        // Don't send files/fileTree - they're already in continuationState.sessionStorage
        modelId: selectedModel,
        aiMode,
        chatMode: isAskMode ? 'ask' : 'agent', // Pass the chat mode to the API
        continuationState, // Include the continuation state
        // Include accumulated content so AI can continue from where it stopped
        partialResponse: {
          content: accumulatedContent,
          reasoning: accumulatedReasoning
        }
      }

      console.log('[ChatPanelV2][Continuation] 📤 Sending continuation request with token:', continuationState.continuationToken)

      const response = await fetch('/api/chat-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(continuationPayload),
        signal: continuationController.signal
      })

      if (!response.ok) {
        throw new Error('Continuation request failed')
      }

      // Handle continuation streaming response
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No continuation response body')

      const decoder = new TextDecoder()
      let continuationAccumulatedContent = ''
      let continuationAccumulatedReasoning = ''
      let lineBuffer = ''

      // Track tool calls locally during continuation to avoid React state race conditions
      // Include position tracking for inline pill display
      const continuationLocalToolCalls: Array<{
        toolName: string
        toolCallId: string
        input: any
        status: 'executing' | 'completed' | 'failed'
        textPosition: number
        reasoningPosition: number
      }> = []

      console.log('[ChatPanelV2][Continuation] 📥 Processing continuation stream')

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          console.log('[ChatPanelV2][Continuation] ✅ Continuation stream complete')
          break
        }

        const chunk = decoder.decode(value, { stream: true })
        lineBuffer += chunk
        const lines = lineBuffer.split('\n')
        lineBuffer = lines.pop() || ''

        const completeLines = lines.filter(line => line.trim())

        for (const line of completeLines) {
          try {
            const jsonString = line.startsWith('data: ') ? line.slice(6) : line
            if (!jsonString || jsonString.startsWith(':')) continue

            const parsed = JSON.parse(jsonString)

            // Skip server-internal chunks
            if (parsed.type === 'start-step' || parsed.type === 'reasoning-start') {
              continue
            }

            console.log('[ChatPanelV2][Continuation] Parsed continuation part:', parsed.type)

            // Handle continuation stream parts - append to original message
            if (parsed.type === 'text-delta') {
              if (parsed.text) {
                // CRITICAL FIX: Filter out tool result JSON that shouldn't be displayed
                // Some models output tool results as text instead of keeping them internal
                const textToAdd = parsed.text
                
                // Check if this text looks like a tool result JSON
                const trimmedText = textToAdd.trim()
                const looksLikeToolResult = (
                  (trimmedText.startsWith('{') || trimmedText.startsWith('Assistant:')) && 
                  (trimmedText.includes('"success"') || trimmedText.includes('"toolCallId"') || 
                   trimmedText.includes('"executionTimeMs"') || trimmedText.includes('"databaseId"'))
                )
                
                // Skip text that appears to be a raw tool result JSON
                if (!looksLikeToolResult) {
                  continuationAccumulatedContent += textToAdd
                  setMessages(prev => prev.map(msg =>
                    msg.id === originalAssistantMessageId
                      ? { ...msg, content: accumulatedContent + continuationAccumulatedContent, reasoning: accumulatedReasoning + continuationAccumulatedReasoning }
                      : msg
                  ))
                } else {
                  console.log('[ChatPanelV2][Continuation][Filter] Filtered out tool result JSON from text content:', trimmedText.substring(0, 100))
                }
              }
            } else if (parsed.type === 'reasoning-delta') {
              if (parsed.text) {
                continuationAccumulatedReasoning += parsed.text
                setMessages(prev => prev.map(msg =>
                  msg.id === originalAssistantMessageId
                    ? { ...msg, content: accumulatedContent + continuationAccumulatedContent, reasoning: accumulatedReasoning + continuationAccumulatedReasoning }
                    : msg
                ))
              }
            } else if (parsed.type === 'tool-call') {
              // Handle tool calls in continuation (same logic as main stream)
              const toolCall = {
                toolName: parsed.toolName,
                toolCallId: parsed.toolCallId,
                args: parsed.input,
                dynamic: false
              }

              console.log('[ChatPanelV2][Continuation][ClientTool] 🔧 Continuation tool call:', toolCall.toolName)

              // DEDUPLICATION: Check if this toolCallId already exists to prevent duplicates
              const existingToolCall = continuationLocalToolCalls.find(tc => tc.toolCallId === toolCall.toolCallId)
              if (existingToolCall) {
                console.log('[ChatPanelV2][Continuation][ClientTool] Skipping duplicate tool call:', toolCall.toolCallId)
                continue // Skip duplicate tool calls
              }

              // Track tool call inline with executing status (both local and state)
              // Calculate positions relative to FULL content (original + continuation)
              const toolCallEntry = {
                toolName: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                input: toolCall.args,
                status: 'executing' as 'executing' | 'completed' | 'failed',
                textPosition: accumulatedContent.length + continuationAccumulatedContent.length,
                reasoningPosition: accumulatedReasoning.length + continuationAccumulatedReasoning.length
              }

              continuationLocalToolCalls.push(toolCallEntry)

              setActiveToolCalls(prev => {
                const newMap = new Map(prev)
                const messageCalls = newMap.get(originalAssistantMessageId) || []
                // DEDUPLICATION: Check before adding to prevent duplicates
                if (!messageCalls.some(tc => tc.toolCallId === toolCall.toolCallId)) {
                  messageCalls.push(toolCallEntry)
                  newMap.set(originalAssistantMessageId, messageCalls)
                }
                return newMap
              })

              const clientSideTools = [
                'write_file',
                'edit_file',
                'client_replace_string_in_file',
                'delete_file',
                'delete_folder',
                'remove_package',
                'read_file',
                'list_files',
                'grep_search',
                'semantic_code_navigator',
                'create_database',
                'request_supabase_connection'
              ]

              if (clientSideTools.includes(toolCall.toolName)) {
                const { handleClientFileOperation } = await import('@/lib/client-file-tools')

                const addToolResult = (result: any) => {
                  console.log('[ChatPanelV2][Continuation][ClientTool] ✅ Continuation tool completed:', result.tool)

                  const newStatus = result.errorText ? 'failed' : 'completed'

                  // Update local tracking
                  const localTool = continuationLocalToolCalls.find(call => call.toolCallId === toolCall.toolCallId)
                  if (localTool) {
                    localTool.status = newStatus
                  }

                  // Update tool status in state for UI
                  setActiveToolCalls(prev => {
                    const newMap = new Map(prev)
                    const messageCalls = newMap.get(originalAssistantMessageId) || []
                    const updatedCalls = messageCalls.map(call =>
                      call.toolCallId === toolCall.toolCallId
                        ? { ...call, status: newStatus as 'executing' | 'completed' | 'failed' }
                        : call
                    )
                    newMap.set(originalAssistantMessageId, updatedCalls)
                    return newMap
                  })
                }

                handleClientFileOperation(toolCall, project.id, addToolResult)
                  .catch(error => {
                    console.error('[ChatPanelV2][Continuation][ClientTool] ❌ Tool execution error:', error)

                    // Update local tracking
                    const localTool = continuationLocalToolCalls.find(call => call.toolCallId === toolCall.toolCallId)
                    if (localTool) {
                      localTool.status = 'failed'
                    }

                    // Update tool status to failed in state
                    setActiveToolCalls(prev => {
                      const newMap = new Map(prev)
                      const messageCalls = newMap.get(originalAssistantMessageId) || []
                      const updatedCalls = messageCalls.map(call =>
                        call.toolCallId === toolCall.toolCallId
                          ? { ...call, status: 'failed' as 'executing' | 'completed' | 'failed' }
                          : call
                      )
                      newMap.set(originalAssistantMessageId, updatedCalls)
                      return newMap
                    })
                  })
              }
            } else if (parsed.type === 'tool-result') {
              console.log('[ChatPanelV2][Continuation][DataStream] Tool result received:', parsed.toolName)

              const resultStatus = parsed.result?.error ? 'failed' : 'completed'

              // Update local tracking
              const localTool = continuationLocalToolCalls.find(call => call.toolCallId === parsed.toolCallId)
              if (localTool) {
                localTool.status = resultStatus
              }

              // Update tool status to completed or failed for server-side tools
              setActiveToolCalls(prev => {
                const newMap = new Map(prev)
                const messageCalls = newMap.get(originalAssistantMessageId) || []
                const updatedCalls = messageCalls.map(call =>
                  call.toolCallId === parsed.toolCallId
                    ? { ...call, status: resultStatus as 'executing' | 'completed' | 'failed' }
                    : call
                )
                newMap.set(originalAssistantMessageId, updatedCalls)
                return newMap
              })
            }
          } catch (e) {
            console.error('[ChatPanelV2][Continuation] ❌ Failed to parse continuation chunk:', e)
            continue
          }
        }
      }

      // Continuation complete - update the original message with combined content
      const finalContent = accumulatedContent + continuationAccumulatedContent
      const finalReasoning = accumulatedReasoning + continuationAccumulatedReasoning

      // Use local tool tracking instead of state (avoids React state race conditions)
      const toolInvocationsForMessage = continuationLocalToolCalls

      console.log(`[ChatPanelV2][Continuation][Save] Preparing to save ${toolInvocationsForMessage.length} tool invocations:`,
        toolInvocationsForMessage.map(t => ({ name: t.toolName, status: t.status }))
      )

      // Convert to the format expected by the database
      const toolInvocationsData = toolInvocationsForMessage.map(tool => ({
        toolName: tool.toolName,
        toolCallId: tool.toolCallId,
        args: tool.input,
        // Both 'completed' and 'failed' should have state='result'
        state: (tool.status === 'completed' || tool.status === 'failed') ? 'result' : 'call',
        result: tool.status === 'completed'
          ? { success: true }
          : (tool.status === 'failed'
            ? { error: 'Tool execution failed' }
            : undefined),
        textPosition: tool.textPosition,
        reasoningPosition: tool.reasoningPosition,
      }))

      if (finalContent.trim() || toolInvocationsData.length > 0) {
        // Update the original message with the complete content
        setMessages(prev => prev.map(msg =>
          msg.id === originalAssistantMessageId
            ? { ...msg, content: finalContent, reasoning: finalReasoning }
            : msg
        ))

        // Save the updated message
        await saveAssistantMessageAfterStreaming(
          originalAssistantMessageId,
          finalContent,
          finalReasoning,
          toolInvocationsData
        )
      }

      console.log('[ChatPanelV2][Continuation] 🎉 Continuation completed successfully')

    } catch (error: any) {
      console.error('[ChatPanelV2][Continuation] ❌ Continuation failed:', error)

      // Clear the continuing state on error
      setContinuingMessageId(null)

      // Remove the thinking indicator from the original message on error
      setMessages(prev => prev.map(msg =>
        msg.id === originalAssistantMessageId
          ? {
            ...msg,
            content: accumulatedContent, // Remove thinking indicator
            reasoning: accumulatedReasoning
          }
          : msg
      ))

      toast({
        title: "Continuation failed",
        description: "Failed to continue the conversation. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
      setAbortController(null)
      setContinuingMessageId(null) // Clear continuing state
      isContinuationInProgressRef.current = false
      setIsContinuationInProgress(false) // Clear continuation flag
    }
  }

  // Initialize file lookup service
  useEffect(() => {
    if (!fileLookupServiceRef.current) {
      fileLookupServiceRef.current = new FileLookupService()
    }
  }, [])

  // Load project files on mount
  useEffect(() => {
    if (project?.id) {
      loadProjectFiles()
      loadMessages()
    }
  }, [project?.id])

  // Check for interrupted streams on mount and auto-recover
  useEffect(() => {
    if (!project?.id || !currentChatSessionId) return

    const checkAndAutoRecoverStreams = async () => {
      try {
        await streamRecoveryManager.init()
        // Also clean up old streams while we're at it
        await streamRecoveryManager.cleanupOldStreams()

        const interruptedStreams = await streamRecoveryManager.getInterruptedStreams(project.id)
        console.log('[StreamRecovery] Found interrupted streams:', interruptedStreams.length)

        if (interruptedStreams.length > 0) {
          // Get the most recent one for this chat session
          const relevantStream = interruptedStreams.find(s => s.chatSessionId === currentChatSessionId)
          if (relevantStream) {
            console.log('[StreamRecovery] 🔄 Auto-recovering interrupted stream:', relevantStream.id)
            // Small delay to let the UI settle before starting recovery
            setTimeout(() => {
              handleRecoverStream(relevantStream)
            }, 500)
          }
        }
      } catch (error) {
        console.error('[StreamRecovery] Error checking for interrupted streams:', error)
      }
    }

    checkAndAutoRecoverStreams()
  }, [project?.id, currentChatSessionId])

  // Handle visibility change and beforeunload for stream interruption
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleVisibilityChange = async () => {
      if (document.hidden && currentStreamIdRef.current && isLoading) {
        console.log('[StreamRecovery] Tab hidden during streaming, marking as interrupted')
        // Flush any pending updates immediately
        await streamRecoveryManager.flushPendingUpdate()
        await streamRecoveryManager.markInterrupted(currentStreamIdRef.current, 'tab_hidden')
      }
    }

    const handleBeforeUnload = async (e: BeforeUnloadEvent) => {
      if (currentStreamIdRef.current && isLoading) {
        console.log('[StreamRecovery] Page unloading during streaming, marking as interrupted')
        // Use sendBeacon pattern for reliable save before unload
        await streamRecoveryManager.flushPendingUpdate()
        await streamRecoveryManager.markInterrupted(currentStreamIdRef.current, 'page_unload')
        // Show browser confirmation dialog
        e.preventDefault()
        e.returnValue = 'AI is still generating a response. Are you sure you want to leave?'
        return e.returnValue
      }
    }

    const handlePageHide = async () => {
      if (currentStreamIdRef.current && isLoading) {
        console.log('[StreamRecovery] Page hiding during streaming, marking as interrupted')
        await streamRecoveryManager.flushPendingUpdate()
        await streamRecoveryManager.markInterrupted(currentStreamIdRef.current, 'page_unload')
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [isLoading])

  // Real-time file change listener for @ command and chat sync
  useEffect(() => {
    if (!project?.id || typeof window === 'undefined') return

    const handleFilesChanged = (e: CustomEvent) => {
      const detail = e.detail as { projectId: string; forceRefresh?: boolean }
      if (detail.projectId === project.id) {
                loadProjectFiles()
      }
    }

    window.addEventListener('files-changed', handleFilesChanged as EventListener)

    return () => {
      window.removeEventListener('files-changed', handleFilesChanged as EventListener)
    }
  }, [project?.id])

  // Listen for "Ask AI to Fix" events from browser console errors
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleAskAiToFix = (e: CustomEvent) => {
      const detail = e.detail as { prompt: string; errors: string[] }
      if (detail.prompt) {
        setInput(detail.prompt)
        // Focus the input after setting it
        setTimeout(() => {
          const textarea = document.querySelector('textarea[placeholder*="Message"]') as HTMLTextAreaElement
          if (textarea) {
            textarea.focus()
            textarea.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }, 100)
      }
    }

    window.addEventListener('ask-ai-to-fix', handleAskAiToFix as EventListener)

    return () => {
      window.removeEventListener('ask-ai-to-fix', handleAskAiToFix as EventListener)
    }
  }, [])

  // Save input to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        if (input.trim()) {
          localStorage.setItem('chat-panel-input', input)
        } else {
          localStorage.removeItem('chat-panel-input')
        }
      } catch (error) {
        // Handle QuotaExceededError - localStorage is full
        // Silently fail as this is just for convenience/persistence
        console.warn('Failed to save input to localStorage:', error)
      }
    }
  }, [input])

  const loadProjectFiles = async () => {
    try {
      if (!fileLookupServiceRef.current || !project?.id) return

      await fileLookupServiceRef.current.initialize(project.id)
      await fileLookupServiceRef.current.refreshFiles()

      // Get files from the lookup service
      const files = fileLookupServiceRef.current['files'] || []
      setProjectFiles(files)
          } catch (error) {
      console.error('[ChatPanelV2] Error loading files via FileLookupService:', error)
      // Fallback to direct storage manager
      try {
        const { storageManager } = await import('@/lib/storage-manager')
        await storageManager.init()
        const files = await storageManager.getFiles(project.id)
        setProjectFiles(files)
        console.log(`[ChatPanelV2] Fallback: Loaded ${files.length} project files via storageManager`)
      } catch (fallbackError) {
        console.error('[ChatPanelV2] Fallback also failed:', fallbackError)
      }
    }
  }

  // Build optimized project file tree for server
  const buildProjectFileTree = async () => {
    if (!project) {
      console.warn('[ChatPanelV2] Cannot build file tree: no project selected')
      return []
    }

    try {
      const { storageManager } = await import('@/lib/storage-manager')
      await storageManager.init()
      const allFiles = await storageManager.getFiles(project.id)

      // Filter out shadcn UI components and common excluded files
      const filteredFiles = allFiles.filter((file: any) => {
        const path = file.path.toLowerCase()
        // Exclude shadcn UI components (don't list individual files in components/ui/)
        if (path.includes('components/ui/') && !file.isDirectory) {
          return false
        }
        // Exclude node_modules, .git, build outputs
        if (path.includes('node_modules') ||
          path.includes('.git/') ||
          path.includes('dist/') ||
          path.includes('build/') ||
          path.includes('.next/')) {
          return false
        }
        return true
      })

      // Build file tree structure
      const fileTree: string[] = []
      const directories = new Set<string>()

      // Collect all directories
      filteredFiles.forEach((file: any) => {
        const pathParts = file.path.split('/')
        if (pathParts.length > 1) {
          // Add all parent directories
          for (let i = 1; i < pathParts.length; i++) {
            const dirPath = pathParts.slice(0, i).join('/')
            if (dirPath) {
              directories.add(dirPath)
            }
          }
        }
      })

      // Add root files first
      const rootFiles = filteredFiles.filter((file: any) => !file.path.includes('/'))
      rootFiles.forEach((file: any) => {
        fileTree.push(file.path)
      })

      // Add directories and their files
      const sortedDirectories = Array.from(directories).sort()
      sortedDirectories.forEach((dir: string) => {
        fileTree.push(`${dir}/`)

        // Add files in this directory
        const dirFiles = filteredFiles.filter((file: any) => {
          const filePath = file.path
          const fileDir = filePath.substring(0, filePath.lastIndexOf('/'))
          return fileDir === dir
        })

        dirFiles.forEach((file: any) => {
          fileTree.push(file.path)
        })
      })

      console.log(`[ChatPanelV2] Built file tree with ${fileTree.length} entries for server`)
      return fileTree
    } catch (error) {
      console.error('[ChatPanelV2] Error building file tree:', error)
      return []
    }
  }

  const loadMessages = async () => {
    if (!project?.id) return

    try {
            const { storageManager } = await import('@/lib/storage-manager')
      await storageManager.init()

      // Get chat sessions for this user
      const chatSessions = await storageManager.getChatSessions(project.userId)

      // Find the active chat session for this project
      const activeSession = chatSessions.find((session: any) =>
        session.workspaceId === project.id && session.isActive
      )

      if (activeSession) {
                // Update the current session ID state
        setCurrentChatSessionId(activeSession.id)

        // Load messages for this session
        const storedMessages = await storageManager.getMessages(activeSession.id)

        // Convert stored messages to the format expected by the UI
        const uiMessages = storedMessages.map((msg: any) => {
          const uiMessage = {
            id: msg.id,
            role: msg.role,
            content: msg.content,
            createdAt: msg.createdAt,
            // Extract reasoning and toolInvocations from metadata for UI compatibility
            reasoning: msg.metadata?.reasoning || '',
            toolInvocations: msg.metadata?.toolInvocations || [],
            metadata: msg.metadata || {}
          }
          return uiMessage
        })

                setMessages(uiMessages)

        // Populate activeToolCalls for loaded messages
        const toolCallsMap = new Map<string, Array<{
          toolName: string
          toolCallId: string
          input?: any
          status: 'executing' | 'completed' | 'failed'
          textPosition?: number
          reasoningPosition?: number
        }>>()

        uiMessages.forEach((msg: any) => {
          if (msg.toolInvocations && msg.toolInvocations.length > 0) {
            const toolCalls = msg.toolInvocations.map((inv: any) => {
              // Determine status based on state and result
              let status: 'executing' | 'completed' | 'failed' = 'completed' // Default to completed for loaded messages

              if (inv.state === 'result') {
                // Tool has explicit result state
                if (inv.result?.error) {
                  status = 'failed'
                } else {
                  status = 'completed'
                }
              } else if (inv.state === 'call') {
                // Tool was saved in 'call' state - check for error/warning
                // If there's a result with error, mark as failed
                // Otherwise, assume completed (stream finished)
                if (inv.result?.error || inv.result?.warning) {
                  status = 'failed'
                } else if (inv.result) {
                  status = 'completed'
                } else {
                  // No result at all - could be incomplete, but since message is saved, treat as completed
                  status = 'completed'
                }
              }

              return {
                toolName: inv.toolName,
                toolCallId: inv.toolCallId,
                input: inv.args,
                status,
                textPosition: inv.textPosition,
                reasoningPosition: inv.reasoningPosition,
              }
            })

            toolCallsMap.set(msg.id, toolCalls)
          }
        })

        setActiveToolCalls(toolCallsMap)
      } else {
        setMessages([])
        setActiveToolCalls(new Map())
      }
    } catch (error) {
      console.error(`[ChatPanelV2] Error loading messages for project ${project?.id}:`, error)
      // Don't show error toast for loading messages, just log it
    }
  }

  // Auto-fill input and simulate user click after delay
  useEffect(() => {
    const autoFillAndSend = async () => {
      if (initialPrompt && project && messages.length === 0 && !isLoading) {
        console.log(`[ChatPanelV2] Auto-filling input with initial prompt`)

        // Set the input message (auto-fill the input box)
        setInput(initialPrompt)

        // Wait 3 seconds then simulate user clicking the send button
        setTimeout(() => {
          console.log(`[ChatPanelV2] Auto-clicking send button after 3 second delay`)
          if (sendButtonRef.current) {
            // Simulate a user click on the send button
            sendButtonRef.current.click()
          }
        }, 3000) // 3 second delay
      }
    }

    autoFillAndSend()
  }, [initialPrompt, project, messages.length, isLoading])

  // Handle loading state based on isLoading state
  useEffect(() => {
    // Loading is managed by isLoading state
  }, [isLoading])

  // Handle errors
  useEffect(() => {
    if (error) {
      console.error('[ChatPanelV2] Error:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to get AI response',
        variant: 'destructive'
      })
    }
  }, [error, toast])

  // Smart scroll: only auto-scroll when user is near the bottom
  useEffect(() => {
    if (userIsNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Track scroll position to show/hide scroll-to-bottom button
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight
      const isNearBottom = distanceFromBottom < 120
      userIsNearBottomRef.current = isNearBottom
      setShowScrollButton(!isNearBottom)
    }
    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // Fetch credit balance
  useEffect(() => {
    const fetchCreditBalance = async () => {
      try {
        const supabase = createClient()
        const { data: { user }, error: userError } = await supabase.auth.getUser()

        if (userError || !user) {
          console.warn('[ChatPanelV2] No authenticated user found')
          return
        }

        // Use getWalletBalance function instead of direct query
        const wallet = await getWalletBalance(user.id, supabase)

        if (wallet) {
          setCreditBalance(wallet.creditsBalance)
          setCurrentPlan(wallet.currentPlan)
        }
      } catch (error) {
        console.error('[ChatPanelV2] Exception fetching credit balance:', error)
      } finally {
        setLoadingCredits(false)
      }
    }

    fetchCreditBalance()

    // Refresh every 30 seconds
    const interval = setInterval(fetchCreditBalance, 30000)
    return () => clearInterval(interval)
  }, [])

  // Handle client-side tool results by sending continuation request - DISABLED
  /*
  const handleClientToolResult = async (
    toolName: string,
    result: any,
    projectId: string | undefined,
    assistantMessageId: string
  ) => {
    if (!projectId) {
      console.error('[ChatPanelV2][ClientTool] Cannot send tool result: no project ID')
      return
    }

    console.log('[ChatPanelV2][ClientTool] Sending client tool result for continuation:', {
      toolName,
      hasOutput: !!result.output,
      hasError: !!result.errorText,
      projectId
    })

    try {
      // Create continuation request with tool result
      const continuationPayload = {
        messages: [], // Empty - we're continuing with tool result
        projectId,
        project: { id: projectId }, // Minimal project info
        databaseId, // Pass database ID from state (loaded from workspace)
        // Don't send files/fileTree - they're already in continuationState if needed
        modelId: selectedModel,
        aiMode,
        chatMode: isAskMode ? 'ask' : 'agent', // Pass the chat mode to the API
        toolResult: {
          toolName,
          result: result.output || { error: result.errorText }
        }
      }

      console.log('[ChatPanelV2][ClientTool] 📤 Sending tool result continuation request')

          const response = await fetch('/api/chat-v2', {
  method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(continuationPayload)
      })

      if (!response.ok) {
        throw new Error('Tool result continuation request failed')
      }

      // Handle the response stream just like a regular chat response
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No continuation response body')

      const decoder = new TextDecoder()
      let accumulatedContent = ''
      let accumulatedReasoning = ''
      let lineBuffer = ''

      console.log('[ChatPanelV2][ClientTool] 📥 Processing tool result continuation stream')

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          console.log('[ChatPanelV2][ClientTool] ✅ Tool result continuation stream complete')
          break
        }

        const chunk = decoder.decode(value, { stream: true })
        lineBuffer += chunk
        const lines = lineBuffer.split('\n')
        lineBuffer = lines.pop() || ''

        const completeLines = lines.filter(line => line.trim())

        for (const line of completeLines) {
          try {
            const jsonString = line.startsWith('data: ') ? line.slice(6) : line
            if (!jsonString || jsonString.startsWith(':')) continue

            const parsed = JSON.parse(jsonString)

            // Skip server-internal chunks
            if (parsed.type === 'start-step' || parsed.type === 'reasoning-start') {
              continue
            }

            console.log('[ChatPanelV2][ClientTool] Parsed continuation part:', parsed.type)

            // Handle continuation stream parts - append to original message
            if (parsed.type === 'text-delta') {
              if (parsed.text) {
                accumulatedContent += parsed.text
                setMessages(prev => prev.map(msg =>
                  msg.id === assistantMessageId
                    ? { ...msg, content: accumulatedContent, reasoning: accumulatedReasoning }
                    : msg
                ))
              }
            } else if (parsed.type === 'reasoning-delta') {
              if (parsed.text) {
                accumulatedReasoning += parsed.text
                setMessages(prev => prev.map(msg =>
                  msg.id === assistantMessageId
                    ? { ...msg, content: accumulatedContent, reasoning: accumulatedReasoning }
                    : msg
                ))
              }
            } else if (parsed.type === 'tool-call') {
              // Handle additional tool calls in continuation
              const toolCall = {
                toolName: parsed.toolName,
                toolCallId: parsed.toolCallId,
                args: parsed.input,
                dynamic: false
              }

              console.log('[ChatPanelV2][ClientTool][Continuation] 🔧 Continuation tool call:', toolCall.toolName)

              const clientSideTools = [
                'write_file', 
                'edit_file', 
                'client_replace_string_in_file',
                'delete_file',
                'delete_folder',
                'remove_package',
                'read_file',
                'list_files',
                'grep_search',
                'semantic_code_navigator',
                'create_database',
                'request_supabase_connection'
              ]
              
              if (clientSideTools.includes(toolCall.toolName)) {
                const { handleClientFileOperation } = await import('@/lib/client-file-tools')

                const addToolResult = (result: any) => {
                  console.log('[ChatPanelV2][ClientTool][Continuation] ✅ Continuation tool completed:', result.tool)
                  // Send this result back too
                  // handleClientToolResult(toolCall.toolName, result, projectId, assistantMessageId)
                }

                handleClientFileOperation(toolCall, projectId, addToolResult)
                  .catch(error => {
                    console.error('[ChatPanelV2][ClientTool][Continuation] ❌ Tool execution error:', error)
                    const errorResult = {
                      tool: toolCall.toolName,
                      toolCallId: toolCall.toolCallId,
                      state: 'output-error',
                      errorText: error instanceof Error ? error.message : 'Unknown error'
                    }
                    // handleClientToolResult(toolCall.toolName, errorResult, projectId, assistantMessageId)
                  })
              }
            } else if (parsed.type === 'tool-result') {
              console.log('[ChatPanelV2][ClientTool][Continuation] Tool result received:', parsed.toolName)
            }
          } catch (e) {
            console.error('[ChatPanelV2][ClientTool] ❌ Failed to parse continuation chunk:', e)
            continue
          }
        }
      }

      // Continuation complete - update the original message with combined content
      // Get tool invocations for this message from activeToolCalls
      const toolInvocationsForMessage = activeToolCalls.get(assistantMessageId) || []

      // Convert to the format expected by the database
      const toolInvocationsData = toolInvocationsForMessage.map(tool => ({
        toolName: tool.toolName,
        toolCallId: tool.toolCallId,
        args: tool.input,
        state: tool.status === 'completed' ? 'result' : 'call',
        result: tool.status === 'completed' ? { success: true } : (tool.status === 'failed' ? { error: 'Tool execution failed' } : undefined),
        textPosition: tool.textPosition,
        reasoningPosition: tool.reasoningPosition,
      }))
      
      if (accumulatedContent.trim() || toolInvocationsData.length > 0) {
        setMessages(prev => prev.map(msg =>
          msg.id === assistantMessageId
            ? { ...msg, content: accumulatedContent, reasoning: accumulatedReasoning }
            : msg
        ))

        // Save the updated message
        await saveAssistantMessageAfterStreaming(
          assistantMessageId,
          accumulatedContent,
          accumulatedReasoning,
          toolInvocationsData
        )
      }

      console.log('[ChatPanelV2][ClientTool] 🎉 Tool result continuation completed successfully')

    } catch (error: any) {
      console.error('[ChatPanelV2][ClientTool] ❌ Tool result continuation failed:', error)

      toast({
        title: "Tool continuation failed",
        description: "Failed to continue with tool result. Please try again.",
        variant: "destructive"
      })
    }
  }
  */

  // Handle backend implementation continuation from UI agent
  const onContinueToBackend = async (prompt: string) => {
    console.log('[ChatPanelV2] 🚀 Starting backend implementation continuation with prompt:', prompt.substring(0, 100) + '...')

    // Set the input to the continuation prompt
    setInput(prompt)

    // Clear any attachments for clean backend session
    setAttachedFiles([])
    setAttachedImages([])
    setAttachedUrls([])
    setAttachedUploadedFiles([])

    // Immediate submission like initial prompt - no delay
    const syntheticEvent = {
      preventDefault: () => { },
      target: null,
      currentTarget: null
    } as unknown as React.FormEvent

    handleEnhancedSubmit(syntheticEvent)
  }

  // Handle stopping the stream and saving partial response
  const handleStop = async () => {
    if (abortController) {
      console.log('[ChatPanelV2] 🛑 Stopping generation as requested by user')
      abortController.abort()
      setAbortController(null)
      setIsLoading(false)
      isContinuationInProgressRef.current = false
      setIsContinuationInProgress(false)

      // Mark stream as user-aborted in recovery manager (won't show recovery prompt)
      if (currentStreamIdRef.current) {
        try {
          await streamRecoveryManager.markUserAborted(currentStreamIdRef.current)
          console.log('[StreamRecovery] Stream marked as user-aborted:', currentStreamIdRef.current)
        } catch (error) {
          console.error('[StreamRecovery] Error marking stream as user-aborted:', error)
        }
        currentStreamIdRef.current = null
      }

      // Use accumulated streaming progress from component state
      const hasPartialContent = streamingContent.trim() || streamingReasoning.trim() || streamingToolCalls.length > 0

      if (streamingMessageId && hasPartialContent) {
        console.log('[ChatPanelV2] Saving partial message due to user stop:', {
          messageId: streamingMessageId,
          contentLength: streamingContent.length,
          reasoningLength: streamingReasoning.length,
          toolCallsCount: streamingToolCalls.length
        })

        // Get start time from the message in state
        const messageInState = messages.find(m => m.id === streamingMessageId)
        const startTime = messageInState?.metadata?.startTime
        const elapsedSeconds = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0

        // Create the partial message with all accumulated data
        const partialMessage = {
          id: streamingMessageId,
          role: 'assistant',
          content: streamingContent || (streamingToolCalls.length > 0 ? 'Task in progress...' : ''),
          createdAt: new Date().toISOString(),
          metadata: {
            reasoning: streamingReasoning,
            toolInvocations: streamingToolCalls,
            hasToolCalls: streamingToolCalls.length > 0,
            durationSeconds: elapsedSeconds,
            isPartial: true // Mark as partial for debugging
          }
        }

        // Save the partial message to the database
        await saveMessageToIndexedDB(partialMessage)

        // Clear streaming state
        setStreamingMessageId(null)
        setStreamingContent('')
        setStreamingReasoning('')
        setStreamingToolCalls([])

        // Reload messages to show the saved partial message in the UI
        await loadMessages()

        toast({
          title: "Stopped",
          description: "Generation stopped and partial response saved."
        })
      } else {
        console.log('[ChatPanelV2] No partial content to save')
        
        // Clear streaming state anyway
        setStreamingMessageId(null)
        setStreamingContent('')
        setStreamingReasoning('')
        setStreamingToolCalls([])
        
        toast({
          title: "Stopped",
          description: "Generation stopped."
        })
      }
    }
  }

  // Handle recovering an interrupted stream - automatically continues from where it stopped
  const handleRecoverStream = async (streamToRecover?: InterruptedStream) => {
    const stream = streamToRecover || interruptedStream
    if (!stream || !project) return

    console.log('[StreamRecovery] 🔄 Auto-recovering and continuing stream:', stream.id)

    try {
      // 1. Restore the partial message to the chat with streaming state
      const recoveredMessage = {
        id: stream.id,
        role: 'assistant',
        content: stream.accumulatedContent || '',
        reasoning: stream.accumulatedReasoning,
        metadata: {
          reasoning: stream.accumulatedReasoning,
          toolInvocations: stream.toolCalls,
          hasToolCalls: stream.toolCalls.length > 0,
          isRecovered: true,
          interruptReason: stream.interruptReason,
          startTime: Date.now() // Reset start time for continuation timing
        }
      }

      // Add/update message in state
      setMessages(prev => {
        const exists = prev.some(m => m.id === recoveredMessage.id)
        if (exists) {
          return prev.map(m => m.id === recoveredMessage.id ? recoveredMessage : m)
        } else {
          return [...prev, recoveredMessage]
        }
      })

      // Restore tool calls state if any
      if (stream.inlineToolCalls.length > 0) {
        setActiveToolCalls(prev => {
          const newMap = new Map(prev)
          newMap.set(stream.id, stream.inlineToolCalls)
          return newMap
        })
      }

      // 2. Set streaming state to show loading indicator
      setIsLoading(true)
      setIsContinuationInProgress(true)
      setContinuingMessageId(stream.id)
      setStreamingMessageId(stream.id)
      setStreamingContent(stream.accumulatedContent)
      setStreamingReasoning(stream.accumulatedReasoning)
      setStreamingToolCalls(stream.toolCalls)

      // Track this as the current stream for interruption detection
      currentStreamIdRef.current = stream.id

      // Clear the recovery state
      setInterruptedStream(null)
      setShowRecoveryDialog(false)

      // Show recovery toast
      toast({
        title: "Resuming response...",
        description: "Continuing from where the AI left off.",
        duration: 3000
      })

      // 3. Create abort controller for continuation
      const continuationController = new AbortController()
      setAbortController(continuationController)

      // 4. Build the continuation payload with partial response context
      // We need to load recent messages for context
      const { storageManager } = await import('@/lib/storage-manager')
      await storageManager.init()

      // Load recent messages for context
      let recentMessages: any[] = []
      if (currentChatSessionId) {
        const allMessages = await storageManager.getMessages(currentChatSessionId)
        recentMessages = allMessages.slice(-10).map((m: any) => ({
          role: m.role,
          content: m.content
        }))
      }

      // Build file tree for context
      const fileTree = await buildProjectFileTree()

      // Get files for context
      const files = projectFiles.map(f => ({
        path: f.path,
        name: f.name,
        content: f.content,
        fileType: f.fileType || f.type
      }))

      // Create continuation request with recovery context
      const recoveryPayload = {
        messages: recentMessages,
        projectId: project.id,
        project,
        databaseId,
        files,
        fileTree,
        modelId: selectedModel,
        aiMode,
        chatMode: isAskMode ? 'ask' : 'agent',
        // Mark this as a recovery continuation
        isRecoveryContinuation: true,
        // Include the partial response so AI knows where to continue from
        partialResponse: {
          content: stream.accumulatedContent,
          reasoning: stream.accumulatedReasoning
        },
        // Include info about tools that were called
        previousToolResults: stream.toolCalls.map((tc: any) => ({
          toolName: tc.toolName,
          toolCallId: tc.toolCallId,
          args: tc.input,
          result: tc.status === 'completed' ? { success: true } : undefined
        }))
      }

      console.log('[StreamRecovery] 📤 Sending recovery continuation request')

      const response = await fetch('/api/chat-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recoveryPayload),
        signal: continuationController.signal
      })

      if (!response.ok) {
        throw new Error('Recovery continuation request failed')
      }

      // 5. Handle the continuation stream - append to existing content
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let continuationContent = ''
      let continuationReasoning = ''
      let lineBuffer = ''

      // Start with existing accumulated content
      let fullContent = stream.accumulatedContent
      let fullReasoning = stream.accumulatedReasoning

      // Track continuation tool calls
      const continuationToolCalls: Array<{
        toolName: string
        toolCallId: string
        input: any
        status: 'executing' | 'completed' | 'failed'
        textPosition: number
        reasoningPosition: number
      }> = [...stream.toolCalls] // Start with existing tool calls

      console.log('[StreamRecovery] 📥 Processing recovery continuation stream')

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          console.log('[StreamRecovery] ✅ Recovery continuation complete')
          break
        }

        const chunk = decoder.decode(value, { stream: true })
        lineBuffer += chunk
        const lines = lineBuffer.split('\n')
        lineBuffer = lines.pop() || ''

        const completeLines = lines.filter(line => line.trim())

        for (const line of completeLines) {
          try {
            const jsonString = line.startsWith('data: ') ? line.slice(6) : line
            if (!jsonString || jsonString.startsWith(':')) continue

            const parsed = JSON.parse(jsonString)

            // Skip server-internal chunks
            if (parsed.type === 'start-step' || parsed.type === 'reasoning-start') continue

            if (parsed.type === 'text-delta' && parsed.text) {
              // Filter tool result JSON
              const trimmedText = parsed.text.trim()
              const looksLikeToolResult = (
                (trimmedText.startsWith('{') || trimmedText.startsWith('Assistant:')) &&
                (trimmedText.includes('"success"') || trimmedText.includes('"toolCallId"') ||
                  trimmedText.includes('"executionTimeMs"') || trimmedText.includes('"databaseId"'))
              )

              if (!looksLikeToolResult) {
                continuationContent += parsed.text
                fullContent = stream.accumulatedContent + continuationContent
                setStreamingContent(fullContent)
                setMessages(prev => prev.map(msg =>
                  msg.id === stream.id
                    ? { ...msg, content: fullContent, reasoning: fullReasoning }
                    : msg
                ))
                // Update recovery progress
                streamRecoveryManager.updateStreamProgress(stream.id, {
                  accumulatedContent: fullContent,
                  accumulatedReasoning: fullReasoning,
                  toolCalls: continuationToolCalls,
                  inlineToolCalls: continuationToolCalls
                })
              }
            } else if (parsed.type === 'reasoning-delta' && parsed.text) {
              continuationReasoning += parsed.text
              fullReasoning = stream.accumulatedReasoning + continuationReasoning
              setStreamingReasoning(fullReasoning)
              setMessages(prev => prev.map(msg =>
                msg.id === stream.id
                  ? { ...msg, content: fullContent, reasoning: fullReasoning }
                  : msg
              ))
              // Update recovery progress
              streamRecoveryManager.updateStreamProgress(stream.id, {
                accumulatedContent: fullContent,
                accumulatedReasoning: fullReasoning,
                toolCalls: continuationToolCalls,
                inlineToolCalls: continuationToolCalls
              })
            } else if (parsed.type === 'tool-call') {
              // Handle tool calls during continuation
              const existingTool = continuationToolCalls.find(tc => tc.toolCallId === parsed.toolCallId)
              if (!existingTool) {
                const toolEntry = {
                  toolName: parsed.toolName,
                  toolCallId: parsed.toolCallId,
                  input: parsed.input,
                  status: 'executing' as const,
                  textPosition: fullContent.length,
                  reasoningPosition: fullReasoning.length
                }
                continuationToolCalls.push(toolEntry)
                setStreamingToolCalls([...continuationToolCalls])
                setActiveToolCalls(prev => {
                  const newMap = new Map(prev)
                  newMap.set(stream.id, [...continuationToolCalls])
                  return newMap
                })

                // Execute client-side tools
                const clientSideTools = [
                  'write_file', 'edit_file', 'client_replace_string_in_file',
                  'delete_file', 'delete_folder', 'remove_package',
                  'read_file', 'list_files', 'grep_search', 'semantic_code_navigator',
                  'create_database', 'request_supabase_connection'
                ]

                if (clientSideTools.includes(parsed.toolName)) {
                  const { handleClientFileOperation } = await import('@/lib/client-file-tools')
                  try {
                    await handleClientFileOperation(
                      { toolName: parsed.toolName, toolCallId: parsed.toolCallId, args: parsed.input },
                      project.id,
                      databaseId || undefined
                    )
                    // Mark as completed
                    const idx = continuationToolCalls.findIndex(tc => tc.toolCallId === parsed.toolCallId)
                    if (idx !== -1) continuationToolCalls[idx].status = 'completed'
                  } catch (error) {
                    const idx = continuationToolCalls.findIndex(tc => tc.toolCallId === parsed.toolCallId)
                    if (idx !== -1) continuationToolCalls[idx].status = 'failed'
                  }
                  setStreamingToolCalls([...continuationToolCalls])
                }
              }
            } else if (parsed.type === 'tool-result') {
              // Mark tool as completed
              const idx = continuationToolCalls.findIndex(tc => tc.toolCallId === parsed.toolCallId)
              if (idx !== -1) {
                continuationToolCalls[idx].status = parsed.result?.error ? 'failed' : 'completed'
                setStreamingToolCalls([...continuationToolCalls])
              }
            }
          } catch (e) {
            // Skip malformed JSON
          }
        }
      }

      // 6. Save the completed message
      const finalMessage = {
        id: stream.id,
        role: 'assistant',
        content: fullContent,
        createdAt: new Date().toISOString(),
        metadata: {
          reasoning: fullReasoning,
          toolInvocations: continuationToolCalls,
          hasToolCalls: continuationToolCalls.length > 0,
          wasRecovered: true
        }
      }
      await saveMessageToIndexedDB(finalMessage)

      // Mark stream as completed (removes from recovery)
      await streamRecoveryManager.completeStream(stream.id)

      console.log('[StreamRecovery] ✅ Recovery and continuation completed successfully')

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[StreamRecovery] Recovery continuation aborted by user')
      } else {
        console.error('[StreamRecovery] Error during recovery continuation:', error)
        toast({
          title: "Recovery Failed",
          description: "Could not continue the interrupted response. You can try sending a new message.",
          variant: "destructive"
        })
        // Mark as recovered so we don't keep trying
        if (stream) {
          await streamRecoveryManager.markRecovered(stream.id)
        }
      }
    } finally {
      // Clear streaming state
      currentStreamIdRef.current = null
      setIsLoading(false)
      isContinuationInProgressRef.current = false
      setIsContinuationInProgress(false)
      setContinuingMessageId(null)
      setStreamingMessageId(null)
      setStreamingContent('')
      setStreamingReasoning('')
      setStreamingToolCalls([])
      setAbortController(null)
    }
  }

  // Handle dismissing stream recovery (user doesn't want to recover)
  const handleDismissRecovery = async () => {
    if (!interruptedStream) return

    console.log('[StreamRecovery] User dismissed recovery for stream:', interruptedStream.id)

    try {
      await streamRecoveryManager.dismissStream(interruptedStream.id)
    } catch (error) {
      console.error('[StreamRecovery] Error dismissing stream:', error)
    }

    setInterruptedStream(null)
    setShowRecoveryDialog(false)
  }

  // Helper function to send a command as a chat message
  const sendCommandAsMessage = (prompt: string) => {
    setInput(prompt)
    // Use setTimeout to allow state to update, then trigger submit
    setTimeout(() => {
      const form = document.querySelector('form') as HTMLFormElement
      if (form) {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      }
    }, 50)
  }

  // Create new chat session
  const createNewChatSession = async () => {
    if (!project?.id || !project?.userId) return

    try {
      const { storageManager } = await import('@/lib/storage-manager')
      await storageManager.init()

      // Deactivate current session
      if (currentChatSessionId) {
        await storageManager.updateChatSession(currentChatSessionId, { isActive: false })
      }

      // Create new session
      const sessions = await storageManager.getChatSessions(project.userId)
      const workspaceSessions = sessions.filter((s: any) => s.workspaceId === project.id)

      const newSession = await storageManager.createChatSession({
        workspaceId: project.id,
        userId: project.userId,
        title: `Chat ${workspaceSessions.length + 1}`,
        isActive: true,
        lastMessageAt: new Date().toISOString(),
      })

      setCurrentChatSessionId(newSession.id)
      setMessages([])
      setInput('')

      toast({ title: 'New Chat', description: 'Started a new conversation' })
    } catch (error) {
      console.error('[ChatPanelV2] Error creating new session:', error)
      toast({ title: 'Error', description: 'Failed to create new chat', variant: 'destructive' })
    }
  }

  // Export chat as markdown
  const exportChatAsMarkdown = () => {
    if (messages.length === 0) {
      toast({ title: 'Nothing to export', description: 'No messages in this chat' })
      return
    }

    const markdown = messages.map(msg => {
      const role = msg.role === 'user' ? '**You:**' : '**Assistant:**'
      return `${role}\n\n${msg.content}\n\n---\n`
    }).join('\n')

    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `chat-export-${new Date().toISOString().split('T')[0]}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    toast({ title: 'Exported', description: 'Chat exported as markdown file' })
  }

  // Regenerate last response
  const regenerateLastResponse = async () => {
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')
    if (!lastUserMessage) {
      toast({ title: 'Nothing to regenerate', description: 'No user message found' })
      return
    }

    // Remove the last assistant message if exists
    const lastAssistantIndex = messages.map(m => m.role).lastIndexOf('assistant')
    if (lastAssistantIndex > -1) {
      setMessages(prev => prev.slice(0, lastAssistantIndex))
    }

    // Resend the last user message
    setInput(lastUserMessage.content)
    setTimeout(() => {
      const form = document.querySelector('form') as HTMLFormElement
      if (form) {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      }
    }, 50)
  }

  // Slash commands configuration - fully functional
  const slashCommandHandlers = getDefaultSlashCommands({
    onFix: () => {
      sendCommandAsMessage('Fix the last error or issue in the code. Check for any bugs, type errors, or problems and resolve them.')
    },
    onExplain: () => {
      sendCommandAsMessage('Explain the code or concept we were just discussing. Break it down in simple terms.')
    },
    onRefactor: () => {
      sendCommandAsMessage('Refactor the current code with best practices. Improve code quality, readability, and maintainability.')
    },
    onTest: () => {
      sendCommandAsMessage('Generate comprehensive tests for the current file or component. Include unit tests and edge cases.')
    },
    onOptimize: () => {
      sendCommandAsMessage('Optimize the code for better performance. Identify bottlenecks and suggest improvements.')
    },
    onSearch: () => {
      setShowSearchDialog(true)
    },
    onDeploy: () => {
      if (project?.id) {
        window.location.href = `/workspace/deployment?project=${project.id}`
      } else {
        toast({ title: 'No project', description: 'Select a project first' })
      }
    },
    onRollback: () => {
      const lastAssistantMessage = messages.filter(m => m.role === 'assistant').pop()
      if (lastAssistantMessage) {
        handleRevertToCheckpoint(lastAssistantMessage.id)
      } else {
        toast({ title: 'Nothing to rollback', description: 'No assistant messages found' })
      }
    },
    onBranch: () => {
      const lastMessage = messages[messages.length - 1]
      if (lastMessage) {
        handleCreateBranch(lastMessage.id, `Branch ${new Date().toLocaleTimeString()}`, 'Created from slash command')
      } else {
        toast({ title: 'No messages', description: 'Add some messages first to branch' })
      }
    },
    onNewChat: () => {
      createNewChatSession()
    },
    onClearChat: async () => {
      if (!project?.id || !project?.userId || !currentChatSessionId) {
        setMessages([])
        setInput('')
        toast({ title: 'Chat Cleared', description: 'Messages cleared' })
        return
      }

      try {
        const { storageManager } = await import('@/lib/storage-manager')
        await storageManager.init()

        // Delete all messages in current session
        const sessionMessages = await storageManager.getMessages(currentChatSessionId)
        for (const msg of sessionMessages) {
          await storageManager.deleteMessage(currentChatSessionId, msg.id)
        }

        setMessages([])
        setInput('')
        toast({ title: 'Chat Cleared', description: 'All messages deleted' })
      } catch (error) {
        console.error('[ChatPanelV2] Error clearing chat:', error)
        setMessages([])
        setInput('')
        toast({ title: 'Chat Cleared', description: 'Messages cleared locally' })
      }
    },
    onExportChat: () => {
      exportChatAsMarkdown()
    },
    onImportContext: () => {
      setInput('I want to add this context to our conversation: ')
      textareaRef.current?.focus()
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.value.length
          textareaRef.current.selectionEnd = textareaRef.current.value.length
        }
      }, 10)
    },
    onRegenerate: () => {
      regenerateLastResponse()
    },
    onMemory: () => {
      setShowMemoryDialog(true)
    },
    onSettings: () => {
      if (project?.name) {
        // Convert project name to slug (lowercase, replace spaces with hyphens)
        const slug = project.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
        window.open(`/workspace/projects/${slug}`, '_blank')
      } else {
        toast({ title: 'No project', description: 'Select a project first' })
      }
    },
    onHelp: () => {
      toast({
        title: 'Slash Commands',
        description: 'Type / to see all available commands. Use ↑↓ to navigate, Enter to select.'
      })
    },
  })

  // Handle slash command selection
  const handleSlashCommandSelect = (command: SlashCommand) => {
    command.action()
    slashCommands.close()
    // Remove the "/" from input if it was just for triggering
    if (input === '/') {
      setInput('')
    }
  }

  // Handle input change with slash command detection
  const handleInputChangeWithSlash = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setInput(value)

    // Detect "/" at the start of input
    if (value.startsWith('/')) {
      const query = value.slice(1) // Remove "/"
      const rect = textareaRef.current?.getBoundingClientRect()
      if (rect) {
        slashCommands.open({ top: rect.top, left: rect.left + 10 })
        slashCommands.updateQuery(query)
      }
    } else {
      slashCommands.close()
    }
  }

  // Handle voice transcript completion
  const handleVoiceTranscript = (transcript: string) => {
    setInput(transcript)
    setShowVoicePanel(false)
  }

  // Handle conversation branching - creates a new chat session with messages up to the branch point
  const handleCreateBranch = async (messageId: string, name: string, description?: string) => {
    if (!project?.id || !project?.userId) {
      toast({ title: 'Error', description: 'Project not loaded', variant: 'destructive' })
      return
    }

    try {
      const { storageManager } = await import('@/lib/storage-manager')
      await storageManager.init()

      // Find the index of the message to branch from
      const messageIndex = messages.findIndex(m => m.id === messageId)
      if (messageIndex === -1) {
        toast({ title: 'Error', description: 'Message not found', variant: 'destructive' })
        return
      }

      // Get messages up to and including the branch point
      const messagesToCopy = messages.slice(0, messageIndex + 1)

      // Deactivate current session
      if (currentChatSessionId) {
        await storageManager.updateChatSession(currentChatSessionId, { isActive: false })
      }

      // Create new chat session
      const newSession = await storageManager.createChatSession({
        workspaceId: project.id,
        userId: project.userId,
        title: name || `Branch from message`,
        isActive: true,
        lastMessageAt: new Date().toISOString(),
      })

      // Copy messages to the new session
      for (const msg of messagesToCopy) {
        await storageManager.createMessage({
          chatSessionId: newSession.id,
          role: msg.role,
          content: msg.content,
          metadata: msg.metadata || {},
          tokensUsed: msg.metadata?.tokensUsed || 0,
        })
      }

      // Update session message count
      await storageManager.updateChatSession(newSession.id, {
        messageCount: messagesToCopy.length,
        lastMessageAt: new Date().toISOString(),
      })

      // Update local state
      setCurrentChatSessionId(newSession.id)
      setMessages(messagesToCopy)

      toast({
        title: 'Branch Created',
        description: `Created "${name}" with ${messagesToCopy.length} messages`
      })

    } catch (error) {
      console.error('[ChatPanelV2] Error creating branch:', error)
      toast({ title: 'Error', description: 'Failed to create branch', variant: 'destructive' })
    }
  }

  // These are now handled by the chat session selector
  const handleSwitchBranch = (branchId: string) => {
    // Handled by ChatSessionSelector in workspace-layout
    toast({ title: 'Info', description: 'Use the chat session dropdown to switch' })
  }

  const handleDeleteBranch = (branchId: string) => {
    // Handled by ChatSessionSelector in workspace-layout
    toast({ title: 'Info', description: 'Use the chat session dropdown to delete' })
  }

  const handleRenameBranch = (branchId: string, newName: string) => {
    // Handled by ChatSessionSelector in workspace-layout
  }

  // Handle opening branch dialog from message button
  const handleBranchFromMessage = (messageId: string) => {
    setBranchingMessageId(messageId)
    setShowBranchDialog(true)
  }

  // Get message preview for branch dialog
  const branchingMessagePreview = branchingMessageId
    ? messages.find(m => m.id === branchingMessageId)?.content?.slice(0, 100) +
      ((messages.find(m => m.id === branchingMessageId)?.content?.length || 0) > 100 ? '...' : '')
    : undefined

  // Handle opening file from search results
  const handleOpenFileFromSearch = useCallback((filePath: string, lineNumber?: number) => {
    // Dispatch event to open file in editor (handled by workspace-layout or file explorer)
    const event = new CustomEvent('openFileInEditor', {
      detail: { filePath, lineNumber }
    })
    window.dispatchEvent(event)

    // Also try to focus the file in the file explorer if available
    const fileEvent = new CustomEvent('focusFileInExplorer', {
      detail: { path: filePath }
    })
    window.dispatchEvent(fileEvent)

    toast({
      title: 'Opening file',
      description: `${filePath}${lineNumber ? `:${lineNumber}` : ''}`
    })
  }, [toast])

  // Handle attaching search context
  const handleAttachSearchContext = useCallback((context: AttachedSearchContext) => {
    setAttachedSearchContexts(prev => {
      // Don't add duplicates
      if (prev.some(c => c.id === context.id)) return prev
      return [...prev, context]
    })
  }, [])

  // Handle removing search context
  const handleRemoveSearchContext = useCallback((id: string) => {
    setAttachedSearchContexts(prev => prev.filter(c => c.id !== id))
  }, [])

  // Enhanced submit with attachments - AI SDK Pattern: Send last 5 messages
  const handleEnhancedSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!input.trim() && attachedFiles.length === 0 && attachedImages.length === 0) {
      return
    }

    // If AI is busy and not processing from queue, add to queue instead
    if (isLoading && !isProcessingQueueRef.current) {
      const messageText = input.trim()
      if (messageText) {
        addToQueue(messageText)
        setInput('')
        if (textareaRef.current) {
          textareaRef.current.style.height = '48px'
        }
        toast({
          title: 'Added to queue',
          description: 'Your message will be sent when the current response completes',
        })
      }
      return
    }

    // Check if images are still processing
    if (attachedImages.some((img: AttachedImage) => img.isProcessing)) {
      toast({
        title: 'Images processing',
        description: 'Please wait for images to finish processing',
        variant: 'destructive'
      })
      return
    }

    // Check if URLs are still processing
    if (attachedUrls.some((url: AttachedUrl) => url.isProcessing)) {
      toast({
        title: 'URLs processing',
        description: 'Please wait for URLs to finish processing',
        variant: 'destructive'
      })
      return
    }

    // Check credit balance before sending message
    if (!loadingCredits && creditBalance !== null && creditBalance <= 0) {
      setShowCreditExhaustionModal(true)
      return
    }

    // Build enhanced message content with attachments
    let enhancedContent = input.trim()
    let displayContent = input.trim() // Content shown to user (without hidden contexts)

    // Handle images - use the already-processed descriptions from attach time
    if (attachedImages.length > 0) {
      const imageContexts = attachedImages
        .map((img: AttachedImage) => {
          const description = img.description || '[Image description not available]'
          return `\n\n--- Image: ${img.name} ---\n${description}\n--- End of Image ---`
        })
        .join('')

      if (imageContexts) {
        enhancedContent = `${enhancedContent}\n\n=== ATTACHED IMAGES CONTEXT ===${imageContexts}\n=== END ATTACHED IMAGES ===`
      }
      console.log(`[ChatPanelV2] Using pre-processed descriptions for ${attachedImages.length} image(s)`)
    }

    // Add URL contents (shown to user)
    if (attachedUrls.length > 0) {
      const urlContents = attachedUrls
        .filter((url: AttachedUrl) => url.content)
        .map((url: AttachedUrl) => `\n\n--- Website: ${url.title || url.url} ---\nURL: ${url.url}\n\nContent:\n${url.content}\n--- End of Website ---`)
        .join('')

      if (urlContents) {
        enhancedContent = `${enhancedContent}\n\n=== ATTACHED WEBSITES CONTEXT ===${urlContents}\n=== END ATTACHED WEBSITES ===`
        displayContent = `${displayContent}\n\n=== ATTACHED WEBSITES ===${urlContents}\n=== END ATTACHED WEBSITES ===`
      }
    }

    // Add uploaded file contents (shown to user)
    if (attachedUploadedFiles.length > 0) {
      const uploadedFileContexts = attachedUploadedFiles
        .map(file => `\n\n--- Uploaded File: ${file.name} ---\n${file.content}\n--- End of ${file.name} ---`)
        .join('')

      if (uploadedFileContexts) {
        enhancedContent = `${enhancedContent}\n\n=== UPLOADED FILES CONTEXT ===${uploadedFileContexts}\n=== END UPLOADED FILES ===`
        displayContent = `${displayContent}\n\n=== UPLOADED FILES ===${uploadedFileContexts}\n=== END UPLOADED FILES ===`
      }
    }

    // Add project files attached via @ command (shown to user)
    if (attachedFiles.length > 0) {
      const fileContexts: string[] = []

      try {
        const { storageManager } = await import('@/lib/storage-manager')
        await storageManager.init()

        for (const attachedFile of attachedFiles) {
          try {
            const fileData = await storageManager.getFile(project.id, attachedFile.path)
            if (fileData && fileData.content) {
              fileContexts.push(`\n\n--- Project File: ${attachedFile.path} ---\n${fileData.content}\n--- End of ${attachedFile.name} ---`)
            }
          } catch (error) {
            console.error(`Error loading attached file ${attachedFile.path}:`, error)
            fileContexts.push(`\n\n--- Project File: ${attachedFile.path} ---\n[Error loading file content]\n--- End of ${attachedFile.name} ---`)
          }
        }

        if (fileContexts.length > 0) {
          enhancedContent = `${enhancedContent}\n\n=== PROJECT FILES CONTEXT ===${fileContexts.join('')}\n=== END PROJECT FILES ===`
          displayContent = `${displayContent}\n\n=== PROJECT FILES ===${fileContexts.join('')}\n=== END PROJECT FILES ===`
        }
      } catch (error) {
        console.error('Error loading attached files:', error)
      }
    }

    // Add tagged component context from visual editor (shown to AI, displayed to user)
    if (taggedComponent) {
      const componentContext = `
--- Tagged Component from Visual Editor ---
Element: <${taggedComponent.tagName}>
${taggedComponent.sourceFile ? `File: ${taggedComponent.sourceFile}${taggedComponent.sourceLine ? `:${taggedComponent.sourceLine}` : ''}` : ''}
Classes: ${taggedComponent.className || 'none'}
${taggedComponent.textContent ? `Text Content: "${taggedComponent.textContent}"` : ''}
--- End Tagged Component ---`

      enhancedContent = `${enhancedContent}\n\n=== TAGGED COMPONENT CONTEXT ===${componentContext}\n=== END TAGGED COMPONENT ===`

      // Display content should also include the rich context for user visibility
      const displayComponentContext = `\n\n📌 **Tagged Component:**\n- Element: \`<${taggedComponent.tagName}>\`${taggedComponent.sourceFile ? `\n- File: \`${taggedComponent.sourceFile}${taggedComponent.sourceLine ? `:${taggedComponent.sourceLine}` : ''}\`` : ''}${taggedComponent.className ? `\n- Classes: \`${taggedComponent.className}\`` : ''}${taggedComponent.textContent ? `\n- Content: "${taggedComponent.textContent}"` : ''}`
      displayContent = `${displayContent}${displayComponentContext}`

      // Clear the tagged component after including it
      if (onClearTaggedComponent) {
        onClearTaggedComponent()
      }
    }

    // Add search context attachments
    if (attachedSearchContexts.length > 0) {
      const searchContexts = attachedSearchContexts
        .map(ctx => `\n\n--- Search Result: ${ctx.filePath}:${ctx.lineNumber} ---\n${ctx.content}\n--- End Result ---`)
        .join('')

      if (searchContexts) {
        enhancedContent = `${enhancedContent}\n\n=== SEARCH CONTEXT ===${searchContexts}\n=== END SEARCH CONTEXT ===`
        displayContent = `${displayContent}\n\n🔍 **Search Context:**${attachedSearchContexts.map(ctx => `\n- \`${ctx.filePath}:${ctx.lineNumber}\`: ${ctx.content.slice(0, 50)}${ctx.content.length > 50 ? '...' : ''}`).join('')}`
      }
    }

    // Store image previews before clearing (for display in message)
    const imagePreviews = attachedImages.map((img: AttachedImage) => ({
      id: img.id,
      name: img.name,
      base64: img.base64
    }))

    // Clear attachments
    setAttachedFiles([])
    setAttachedImages([])
    setAttachedUploadedFiles([])
    setAttachedUrls([])
    setAttachedSearchContexts([])
    setInput('')
    setIsLoading(true)

    // Clear any previous errors
    setError(null)

    // Create user message with image previews
    const userMessageId = Date.now().toString()
    const userMessage = {
      id: userMessageId,
      role: 'user',
      content: displayContent,
      images: imagePreviews.length > 0 ? imagePreviews : undefined
    }

    // Add user message to local state immediately for better UX
    setMessages(prev => [...prev, userMessage])

    // Save user message to IndexedDB immediately
    await saveMessageToIndexedDB(userMessage)
    console.log(`[ChatPanelV2] User message saved to database: ${userMessageId}`)

    // Create checkpoint for this message
    if (project) {
      try {
        // Small delay to ensure message is saved before creating checkpoint
        await new Promise(resolve => setTimeout(resolve, 50))
        await createCheckpoint(project.id, userMessage.id)
        console.log(`[Checkpoint] Created checkpoint for message ${userMessage.id}`)
      } catch (error) {
        console.error('[Checkpoint] Error creating checkpoint:', error)
      }
    }

    // Add placeholder assistant message
    const assistantMessageId = (Date.now() + 1).toString()
    const messageStartTime = Date.now() // Track start time
    const assistantMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '', // Start with empty content so spinner shows immediately
      metadata: {
        startTime: messageStartTime // Store start time in message metadata
      }
    }
    setMessages(prev => [...prev, assistantMessage])

    // Initialize streaming state for this message
    setStreamingMessageId(assistantMessageId)
    setStreamingContent('')
    setStreamingReasoning('')
    setStreamingToolCalls([])

    // Start tracking this stream for recovery
    currentStreamIdRef.current = assistantMessageId
    try {
      await streamRecoveryManager.init()
      await streamRecoveryManager.startStream({
        streamId: assistantMessageId,
        projectId: project.id,
        chatSessionId: currentChatSessionId || 'default',
        userMessageId: userMessageId,
        userMessageContent: displayContent
      })
      console.log('[StreamRecovery] Started tracking stream:', assistantMessageId)
    } catch (error) {
      console.error('[StreamRecovery] Error starting stream tracking:', error)
    }

    console.log(`[ChatPanelV2] 🕐 Created assistant message with start time:`, {
      id: assistantMessageId,
      startTime: messageStartTime
    })

    // Create abort controller for this request
    const controller = new AbortController()
    setAbortController(controller)

    // AI SDK Pattern: Send last 10 messages + new message for context
    try {
      // Get last 10 messages from current conversation
      const recentMessages = messages.slice(-10)

      // Build the new message content - always text-only since images are processed through describe-image API
      // This ensures consistent behavior and proper intent detection (clone, debug, context) for all models
      const newMessageContent = enhancedContent

      const messagesToSend = [
        ...recentMessages.map((m: any) => ({ role: m.role, content: m.content })),
        { role: 'user', content: newMessageContent }
      ]

      console.log(`[ChatPanelV2] Sending ${messagesToSend.length} messages to server (last 10 + new)`)

      // Always refresh project files to catch latest changes made by user
      console.log(`[ChatPanelV2] Refreshing project files for real-time sync...`)
      await loadProjectFiles()

      // Build project file tree on client-side with latest data
      const fileTree = await buildProjectFileTree()

      // Fetch Supabase access token and project details for the current PixelPilot project
      let supabaseAccessToken = supabaseToken // Use the hook's token
      let supabaseProjectDetails = null
      let supabaseUserId = null
      let stripeApiKey = null // Stripe API key for payment operations

      try {
        const { getSupabaseProjectForPixelPilotProject, getDeploymentTokens } = await import('@/lib/cloud-sync')

        // Get the authenticated user from Supabase session
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()
        const { data: { user }, error: userError } = await supabase.auth.getUser()

        if (userError || !user) {
          console.warn('[ChatPanelV2] No authenticated Supabase user found')
        } else {
          supabaseUserId = user.id

          // Get Supabase project details for the current PixelPilot project using the authenticated userId
          if (project?.id) {
            supabaseProjectDetails = await getSupabaseProjectForPixelPilotProject(supabaseUserId, project.id)
          }

          // Fetch Stripe API key from cloud sync
          const deploymentTokens = await getDeploymentTokens(supabaseUserId)
          if (deploymentTokens?.stripe) {
            stripeApiKey = deploymentTokens.stripe
            console.log('[ChatPanelV2] ✅ Stripe API key retrieved from cloud sync')
          } else {
            console.warn('[ChatPanelV2] ⚠️ No Stripe API key found in cloud sync')
          }
        }

        console.log(`[ChatPanelV2] Cloud sync data fetched:`, {
          hasToken: !!supabaseAccessToken,
          hasProjectDetails: !!supabaseProjectDetails,
          hasUserId: !!supabaseUserId,
          projectId: supabaseProjectDetails?.supabaseProjectId,
          tokenLength: supabaseAccessToken?.length,
          tokenExpired,
          tokenError,
          hasStripeKey: !!stripeApiKey
        })
      } catch (error) {
        console.warn('[ChatPanelV2] Failed to fetch cloud sync data:', error)
        // Continue without cloud sync data - tools will handle the missing tokens gracefully
      }

      // Compress project files for efficient transfer (only for initial requests, not continuations)
      console.log(`[ChatPanelV2] 📦 Compressing ${projectFiles.length} project files...`)
      const isInitialPrompt = messages.length === 0 // No previous messages (first prompt)
      // Build MCP servers list using runtime toggles from command menu
      const mcpServersForProject: any[] = loadedMcpServers
        .filter(s => s.transport !== 'stdio' && s.url && (mcpServerToggles[s.id || s.name] !== false))
        .map(s => ({
          name: s.name,
          url: s.url,
          transport: s.transport || 'http',
          headers: { ...(s.headers || {}), ...(s.env || {}) },
        }))

      // Build disabled tool categories from runtime toggles + feature toggles
      const disabledToolCategories = Object.entries(toolCategoryToggles)
        .filter(([, enabled]) => !enabled)
        .map(([cat]) => cat)
      // Also disable web_tools and image_gen based on feature toggles
      if (!webSearchEnabled && !disabledToolCategories.includes('web_tools')) {
        disabledToolCategories.push('web_tools')
      }
      if (!imageGenEnabled && !disabledToolCategories.includes('image_gen')) {
        disabledToolCategories.push('image_gen')
      }

      const metadata = {
        project,
        databaseId,
        supabaseAccessToken,
        supabaseProjectDetails,
        supabase_projectId: supabaseProjectDetails?.supabaseProjectId,
        supabaseUserId,
        stripeApiKey,
        isInitialPrompt,
        mcpServers: mcpServersForProject.length > 0 ? mcpServersForProject : undefined,
        disabledToolCategories: disabledToolCategories.length > 0 ? disabledToolCategories : undefined,
        disabledTools: disabledIndividualTools.length > 0 ? disabledIndividualTools : undefined,
      }
      const compressedData = await compressProjectFiles(projectFiles, fileTree, messagesToSend, metadata)

      // For initial prompt, force use anthropic/claude-haiku-4.5 model for UI prototyping
      // Subsequent requests follow user/default model selection
      const modelToUse = isInitialPrompt ? 'anthropic/claude-haiku-4.5' : selectedModel

      console.log(`[ChatPanelV2] Using model: ${modelToUse} (${isInitialPrompt ? 'initial prompt override (UI prototyping)' : 'user selection'})`)

      // Check compressed data size and use storage for large payloads (> 1MB)
      const compressedSize = compressedData.byteLength
      const MAX_PAYLOAD_SIZE = 1024 * 1024 // 1MB limit
      let requestBody: ArrayBuffer | string = compressedData
      let contentType = 'application/octet-stream'
      let usingStorage = false

      if (compressedSize > MAX_PAYLOAD_SIZE) {
        console.log(`[ChatPanelV2] 📦 Compressed payload size ${compressedSize} bytes exceeds 1MB limit, using storage upload`)

        // Get current user for storage upload
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          throw new Error('User not authenticated')
        }

        // Prepare uncompressed data for storage (since API will need to decompress anyway)
        const uncompressedData = {
          projectFiles,
          fileTree,
          messages: messagesToSend,
          metadata
        }

        // Upload to storage
        const storageUrl = await uploadLargePayload(
          uncompressedData,
          'chat-files',
          user.id,
          {
            projectId: project.id,
            compressedSize,
            model: modelToUse,
            isInitialPrompt
          }
        )

        if (!storageUrl) {
          throw new Error('Failed to upload large chat payload to storage')
        }

        // Use storage URL as payload
        requestBody = storageUrl
        contentType = 'application/json'
        usingStorage = true

        console.log(`[ChatPanelV2] 📦 Files uploaded to storage, URL: ${storageUrl}`)
      }

      const response = await fetch('/api/chat-v2', {
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          // Send minimal metadata in headers for binary requests
          'X-Model-Id': modelToUse,
          'X-Ai-Mode': aiMode,
          'X-Chat-Mode': isAskMode ? 'ask' : 'agent',
          'X-Is-Initial-Prompt': isInitialPrompt.toString(),
          'X-Using-Storage': usingStorage.toString()
        },
        body: requestBody,
        signal: controller.signal
      })

      if (!response.ok) {
        throw new Error('Failed to send message')
      }

      // Handle streaming response with AI SDK v5 data stream protocol
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let accumulatedContent = ''
      let accumulatedReasoning = ''
      let lineBuffer = '' // Buffer for incomplete lines across chunks

      // Track tool calls locally during this stream to avoid React state race conditions
      // textPosition tracks where in the text stream the tool was called (for inline rendering)
      // reasoningPosition tracks where in the reasoning stream the tool was called
      const localToolCalls: Array<{
        toolName: string
        toolCallId: string
        input: any
        status: 'executing' | 'completed' | 'failed'
        textPosition: number // Character position in text when tool was called
        reasoningPosition: number // Character position in reasoning when tool was called
      }> = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          console.log('[ChatPanelV2][DataStream] 📊 Stream complete')
          break
        }

        const chunk = decoder.decode(value, { stream: true })

        // Add chunk to buffer and split by newlines
        // Important: Don't trim individual lines yet - metadata might span multiple chunks
        lineBuffer += chunk
        const lines = lineBuffer.split('\n')

        // Keep the last incomplete line in the buffer
        lineBuffer = lines.pop() || ''

        // Process complete lines
        const completeLines = lines.filter(line => line.trim())

        for (const line of completeLines) {
          try {
            // Remove SSE "data: " prefix if present
            const jsonString = line.startsWith('data: ') ? line.slice(6) : line

            // Skip empty lines or SSE comments
            if (!jsonString || jsonString.startsWith(':')) {
              continue
            }

            // Parse AI SDK v5 stream protocol
            // Format: {"type":"0","value":"text"} or {"type":"tool-call",...}
            const parsed = JSON.parse(jsonString)

            // Skip server-internal chunks that shouldn't be exposed to client
            if (parsed.type === 'start-step' || parsed.type === 'reasoning-start') {
              console.log('[ChatPanelV2][DataStream] Skipping server-internal chunk:', parsed.type)
              continue
            }

            console.log('[ChatPanelV2][DataStream] Parsed stream part:', parsed)

            // Handle different stream part types
            if (parsed.type === 'text-delta') {
              // Text delta - accumulate the text
              if (parsed.text) {
                // CRITICAL FIX: Filter out tool result JSON that shouldn't be displayed
                // Some models output tool results as text instead of keeping them internal
                const textToAdd = parsed.text
                
                // Check if this text looks like a tool result JSON
                const trimmedText = textToAdd.trim()
                const looksLikeToolResult = (
                  (trimmedText.startsWith('{') || trimmedText.startsWith('Assistant:')) && 
                  (trimmedText.includes('"success"') || trimmedText.includes('"toolCallId"') || 
                   trimmedText.includes('"executionTimeMs"') || trimmedText.includes('"databaseId"'))
                )
                
                // Skip text that appears to be a raw tool result JSON
                if (!looksLikeToolResult) {
                  accumulatedContent += textToAdd
                  setStreamingContent(accumulatedContent) // Store in component state
                  setMessages(prev => prev.map(msg =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: accumulatedContent, reasoning: accumulatedReasoning }
                      : msg
                  ))
                  // Update stream recovery progress (debounced)
                  streamRecoveryManager.updateStreamProgress(assistantMessageId, {
                    accumulatedContent,
                    accumulatedReasoning,
                    toolCalls: localToolCalls,
                    inlineToolCalls: localToolCalls
                  })
                } else {
                  console.log('[ChatPanelV2][Filter] Filtered out tool result JSON from text content:', trimmedText.substring(0, 100))
                }
              }
            } else if (parsed.type === 'reasoning-delta') {
              // Reasoning delta - accumulate reasoning separately
              if (parsed.text) {
                accumulatedReasoning += parsed.text
                setStreamingReasoning(accumulatedReasoning) // Store in component state
                setMessages(prev => prev.map(msg =>
                  msg.id === assistantMessageId
                    ? { ...msg, content: accumulatedContent, reasoning: accumulatedReasoning }
                    : msg
                ))
                // Update stream recovery progress (debounced)
                streamRecoveryManager.updateStreamProgress(assistantMessageId, {
                  accumulatedContent,
                  accumulatedReasoning,
                  toolCalls: localToolCalls,
                  inlineToolCalls: localToolCalls
                })
              }
            } else if (parsed.type === 'continuation_signal') {
              // STREAM CONTINUATION: Handle automatic continuation request
              console.log('[ChatPanelV2][Continuation] 🔄 Received continuation signal:', parsed.continuationState?.continuationToken)

              // Mark that continuation is in progress to keep loading active
              // Use ref for synchronous access in finally block (state is async)
              isContinuationInProgressRef.current = true
              setIsContinuationInProgress(true)

              // Show continuation message to user
              toast({
                title: "Continuing conversation...",
                description: "Stream will continue seamlessly due to time constraints.",
                duration: 3000
              })

              // Automatically trigger continuation after a brief delay
              setTimeout(async () => {
                await handleStreamContinuation(parsed.continuationState, assistantMessageId, accumulatedContent, accumulatedReasoning)
              }, 1000)

              // Don't process any more chunks after continuation signal
              break
            } else if (parsed.type === 'tool-call') {
              // CLIENT-SIDE TOOL EXECUTION: Execute file operation tools on IndexedDB
              const toolCall = {
                toolName: parsed.toolName,
                toolCallId: parsed.toolCallId,
                args: parsed.input, // AI SDK sends 'input' not 'args'
                dynamic: false // We don't use dynamic tools
              }

              console.log('[ChatPanelV2][ClientTool] 🔧 Tool call received:', {
                toolName: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                args: toolCall.args
              })

              // Track tool call inline with executing status (both local and state)
              // DEDUPLICATION: Check if this toolCallId already exists to prevent duplicates
              const existingToolCall = localToolCalls.find(tc => tc.toolCallId === toolCall.toolCallId)
              if (existingToolCall) {
                console.log('[ChatPanelV2][ClientTool] Skipping duplicate tool call:', toolCall.toolCallId)
                continue // Skip duplicate tool calls
              }

              const toolCallEntry = {
                toolName: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                input: toolCall.args,
                status: 'executing' as 'executing' | 'completed' | 'failed',
                textPosition: accumulatedContent.length, // Track where in text this tool was called
                reasoningPosition: accumulatedReasoning.length // Track where in reasoning this tool was called
              }

              localToolCalls.push(toolCallEntry)

              // Store in component state for handleStop access
              setStreamingToolCalls([...localToolCalls])

              setActiveToolCalls(prev => {
                const newMap = new Map(prev)
                const messageCalls = newMap.get(assistantMessageId) || []
                // DEDUPLICATION: Check before adding to prevent duplicates
                if (!messageCalls.some(tc => tc.toolCallId === toolCall.toolCallId)) {
                  messageCalls.push(toolCallEntry)
                  newMap.set(assistantMessageId, messageCalls)
                }
                return newMap
              })

              // Check if this is a client-side tool (both read and write operations)
              const clientSideTools = [
                'write_file',
                'edit_file',
                'client_replace_string_in_file',
                'delete_file',
                'delete_folder',
                'remove_package',
                'read_file',
                'list_files',
                'grep_search',
                'semantic_code_navigator',
                'create_database',
                'request_supabase_connection'
              ]

              if (clientSideTools.includes(toolCall.toolName)) {
                console.log('[ChatPanelV2][ClientTool] ⚡ Executing client-side tool:', toolCall.toolName)

                // Execute the tool on client-side IndexedDB immediately
                const { handleClientFileOperation } = await import('@/lib/client-file-tools')

                // Define addToolResult function - this sends the result back to the AI
                const addToolResult = (result: any) => {
                  console.log('[ChatPanelV2][ClientTool] ✅ Client-side tool completed:', {
                    tool: result.tool,
                    toolCallId: result.toolCallId,
                    success: !result.errorText,
                    output: result.output
                  })

                  // Update tool status to completed or failed (both local and state)
                  const newStatus = result.errorText ? 'failed' : 'completed'

                  // Update local tracking
                  const localTool = localToolCalls.find(call => call.toolCallId === toolCall.toolCallId)
                  if (localTool) {
                    localTool.status = newStatus
                  }

                  // Update state for UI
                  setActiveToolCalls(prev => {
                    const newMap = new Map(prev)
                    const messageCalls = newMap.get(assistantMessageId) || []
                    const updatedCalls = messageCalls.map(call =>
                      call.toolCallId === toolCall.toolCallId
                        ? { ...call, status: newStatus as 'executing' | 'completed' | 'failed' }
                        : call
                    )
                    newMap.set(assistantMessageId, updatedCalls)
                    return newMap
                  })

                  // For client-side tools, we need to send the result back to continue the conversation
                  // Create a continuation request with the tool result
                  // handleClientToolResult(toolCall.toolName, result, project?.id, assistantMessageId)
                }

                // Execute the tool asynchronously (don't await - per AI SDK docs)
                handleClientFileOperation(toolCall, project?.id, addToolResult)
                  .catch(error => {
                    console.error('[ChatPanelV2][ClientTool] ❌ Tool execution error:', error)

                    // Update tool status to failed (both local and state)
                    const localTool = localToolCalls.find(call => call.toolCallId === toolCall.toolCallId)
                    if (localTool) {
                      localTool.status = 'failed'
                    }

                    setActiveToolCalls(prev => {
                      const newMap = new Map(prev)
                      const messageCalls = newMap.get(assistantMessageId) || []
                      const updatedCalls = messageCalls.map(call =>
                        call.toolCallId === toolCall.toolCallId
                          ? { ...call, status: 'failed' as 'executing' | 'completed' | 'failed' }
                          : call
                      )
                      newMap.set(assistantMessageId, updatedCalls)
                      return newMap
                    })

                    // Send error result back
                    const errorResult = {
                      tool: toolCall.toolName,
                      toolCallId: toolCall.toolCallId,
                      state: 'output-error',
                      errorText: error instanceof Error ? error.message : 'Unknown error'
                    }
                    // handleClientToolResult(toolCall.toolName, errorResult, project?.id, assistantMessageId)
                  })
              } else {
                // Server-side tool - just log it, it's already tracked above
                console.log('[ChatPanelV2][DataStream] Server-side tool call tracked:', parsed.toolName)
              }
            } else if (parsed.type === 'tool-result') {
              // Tool result - these come from server-side tool executions
              console.log('[ChatPanelV2][DataStream] Tool result received:', {
                toolName: parsed.toolName,
                toolCallId: parsed.toolCallId
              })

              const resultStatus = parsed.result?.error ? 'failed' : 'completed'

              // Update local tracking
              const localTool = localToolCalls.find(call => call.toolCallId === parsed.toolCallId)
              if (localTool) {
                localTool.status = resultStatus
              }
              
              // Update streaming state for handleStop access
              setStreamingToolCalls([...localToolCalls])

              // Update tool status to completed or failed for server-side tools
              setActiveToolCalls(prev => {
                const newMap = new Map(prev)
                const messageCalls = newMap.get(assistantMessageId) || []
                const updatedCalls = messageCalls.map(call =>
                  call.toolCallId === parsed.toolCallId
                    ? { ...call, status: resultStatus as 'executing' | 'completed' | 'failed' }
                    : call
                )
                newMap.set(assistantMessageId, updatedCalls)
                return newMap
              })
            }
          } catch (e) {
            // Log error details to help debug parsing issues
            console.error('[ChatPanelV2][DataStream] ❌ Failed to parse chunk:', {
              error: e instanceof Error ? e.message : String(e),
              line: line.substring(0, 200), // Log first 200 chars of problematic line
              lineLength: line.length
            })
            continue
          }
        }
      }

      // Stream complete - client-side tools executed during streaming
      console.log('[ChatPanelV2][DataStream] 📊 Stream complete:', {
        contentLength: accumulatedContent.length,
        hasProject: !!project,
        localToolCallsCount: localToolCalls.length
      })

      // Use local tool tracking instead of state (avoids React state race conditions)
      const toolInvocationsForMessage = localToolCalls

      console.log(`[ChatPanelV2][Save] Preparing to save ${toolInvocationsForMessage.length} tool invocations:`,
        toolInvocationsForMessage.map(t => ({ name: t.toolName, status: t.status }))
      )

      // Convert to the format expected by the database
      const toolInvocationsData = toolInvocationsForMessage.map(tool => ({
        toolName: tool.toolName,
        toolCallId: tool.toolCallId,
        args: tool.input,
        state: tool.status === 'completed' ? 'result' : 'call',
        result: tool.status === 'completed' ? { success: true } : (tool.status === 'failed' ? { error: 'Tool execution failed' } : undefined),
        textPosition: tool.textPosition,
        reasoningPosition: tool.reasoningPosition,
      }))

      console.log(`[ChatPanelV2][Save] Tool invocations data for database:`, toolInvocationsData)

      // Save assistant message to database after streaming completes
      if (accumulatedContent.trim() || toolInvocationsData.length > 0) {
        await saveAssistantMessageAfterStreaming(
          assistantMessageId,
          accumulatedContent,
          accumulatedReasoning,
          toolInvocationsData
        )
      }

      // Mark stream as completed in recovery manager (removes from recovery)
      try {
        await streamRecoveryManager.completeStream(assistantMessageId)
        console.log('[StreamRecovery] Stream completed successfully:', assistantMessageId)
      } catch (error) {
        console.error('[StreamRecovery] Error completing stream:', error)
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        // Request was aborted - don't remove message, handleStop already saved it
        console.log('[ChatPanelV2] Request aborted by user, partial message saved by handleStop')
        // Note: handleStop already marks the stream as user_aborted
      } else {
        setError(error)
        console.error('[ChatPanelV2] Stream error (non-abort):', error.message || error)
        // Preserve the assistant message with whatever content was streamed so far
        // instead of deleting it (which loses user progress)
        setMessages(prev => prev.map(msg => {
          if (msg.id === assistantMessageId) {
            const currentContent = typeof msg.content === 'string' ? msg.content : ''
            // Only keep the message if it has some content; remove empty placeholders
            if (!currentContent.trim()) {
              return null
            }
            return {
              ...msg,
              content: currentContent + '\n\n---\n*Stream interrupted due to a network error. You can try sending your message again.*'
            }
          }
          return msg
        }).filter(Boolean) as any)
        // Clean up tool calls for failed message
        setActiveToolCalls(prev => {
          const newMap = new Map(prev)
          newMap.delete(assistantMessageId)
          return newMap
        })
        // Clear streaming state on error
        setStreamingMessageId(null)
        setStreamingContent('')
        setStreamingReasoning('')
        setStreamingToolCalls([])
        // Mark stream as interrupted due to error
        try {
          await streamRecoveryManager.markInterrupted(assistantMessageId, 'network_error')
        } catch (e) {
          console.error('[StreamRecovery] Error marking stream as interrupted:', e)
        }
      }
    } finally {
      // Clear the current stream ref
      currentStreamIdRef.current = null
      // Only turn off loading if continuation is not in progress
      // Use ref for synchronous check (state may not have updated yet)
      if (!isContinuationInProgressRef.current) {
        setIsLoading(false)
      }
      setAbortController(null)
    }
  }

  // Web Speech API real-time speech-to-text implementation
  const startWebSpeechRecognition = () => {
    try {
      // @ts-ignore - Web Speech API types
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      const recognition = new SpeechRecognition()

      // Enhanced settings for real-time typing
      recognition.continuous = true
      recognition.interimResults = true // Enable instant real-time results
      recognition.lang = 'en-US'
      // @ts-ignore - maxAlternatives is supported but not in the TypeScript types
      recognition.maxAlternatives = 1

      // Store the initial input value when starting
      const initialInput = input
      let lastFinalTranscript = ''
      let silenceTimer: NodeJS.Timeout | null = null

      recognition.onstart = () => {
        setIsRecording(true)
        lastFinalTranscript = ''
        toast({
          title: "🎤 Listening...",
          description: "Speak now. I'll stop automatically when you're done."
        })
      }

      recognition.onresult = (event: any) => {
        // Clear any existing silence timer
        if (silenceTimer) {
          clearTimeout(silenceTimer)
        }

        let interimTranscript = ''
        let finalTranscript = ''

        // Process all results for instant typing effect
        for (let i = 0; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript

          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' '
          } else {
            interimTranscript += transcript
          }
        }

        // Combine final and interim for instant real-time typing
        const combinedText = (finalTranscript || lastFinalTranscript) + interimTranscript

        // Update final transcript tracker
        if (finalTranscript) {
          lastFinalTranscript = finalTranscript
        }

        // Instantly update the input field with real-time text
        if (combinedText.trim()) {
          const updatedInput = initialInput
            ? `${initialInput} ${combinedText.trim()}`
            : combinedText.trim()
          setInput(updatedInput)
        }

        // Auto-stop detection: Set timer to stop after 2 seconds of silence
        silenceTimer = setTimeout(() => {
          if (recognition && recognitionRef.current) {
            recognition.stop()
            toast({
              title: "Recording stopped",
              description: "Stopped due to silence detected"
            })
          }
        }, 2000) // 2 seconds of silence triggers auto-stop
      }

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error)

        // Clear silence timer on error
        if (silenceTimer) {
          clearTimeout(silenceTimer)
        }

        if (event.error === 'not-allowed' || event.error === 'permission-denied') {
          toast({
            title: "❌ Microphone access denied",
            description: "Please allow microphone access to use voice input",
            variant: "destructive"
          })
        } else if (event.error === 'no-speech') {
          toast({
            title: "⚠️ No speech detected",
            description: "Please try speaking louder or closer to the microphone",
            variant: "destructive"
          })
        } else if (event.error === 'aborted') {
          // User manually stopped, don't show error
          console.log('Recognition aborted by user')
        } else {
          toast({
            title: "Recognition error",
            description: `Error: ${event.error}. Please try again.`,
            variant: "destructive"
          })
        }
        setIsRecording(false)
      }

      recognition.onend = () => {
        // Clear any pending silence timer
        if (silenceTimer) {
          clearTimeout(silenceTimer)
        }

        // Only show success if we actually captured text
        if (lastFinalTranscript.trim()) {
          toast({
            title: "✅ Speech recognized successfully",
            description: "Your speech has been converted to text"
          })
        }

        setIsRecording(false)
        recognitionRef.current = null
      }

      recognitionRef.current = recognition
      recognition.start()
    } catch (error) {
      console.error('Error starting Web Speech Recognition:', error)
      toast({
        title: "Speech recognition not available",
        description: "Your browser doesn't support speech recognition",
        variant: "destructive"
      })
    }
  }

  const startDeepgramRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' })
        await transcribeWithDeepgram(audioBlob)

        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)

      toast({
        title: "Recording started",
        description: "Speak now... Click again to stop"
      })
    } catch (error) {
      console.error('Error starting recording:', error)
      toast({
        title: "Recording failed",
        description: "Could not access microphone. Please check permissions.",
        variant: "destructive"
      })
    }
  }

  const stopDeepgramRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      setIsTranscribing(true)
    }
  }

  const transcribeWithDeepgram = async (audioBlob: Blob) => {
    try {
      // Convert blob to base64
      const reader = new FileReader()
      reader.readAsDataURL(audioBlob)

      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1]

        // Send to speech-to-text API
        const response = await fetch('/api/speech-to-text', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ audio: base64Audio }),
        })

        if (!response.ok) {
          throw new Error('Failed to transcribe audio')
        }

        const data = await response.json()

        if (data.success && data.text) {
          // Append transcribed text to input
          setInput(prev => prev ? `${prev} ${data.text}` : data.text)

          toast({
            title: "Transcription complete",
            description: "Your speech has been converted to text"
          })
        } else {
          throw new Error('No transcription received')
        }
      }

      reader.onerror = () => {
        throw new Error('Failed to read audio file')
      }
    } catch (error) {
      console.error('Error transcribing audio:', error)
      toast({
        title: "Transcription failed",
        description: "Could not convert speech to text",
        variant: "destructive"
      })
    } finally {
      setIsTranscribing(false)
    }
  }

  const handleMicrophoneClick = () => {
    if (isRecording) {
      // Stop current recording
      if (recognitionRef.current) {
        recognitionRef.current.stop()
        setIsRecording(false) // Immediately update state
        recognitionRef.current = null
      } else if (mediaRecorderRef.current) {
        stopDeepgramRecording()
      }
    } else {
      // Check if Web Speech API is available, otherwise fallback to Deepgram
      if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
        startWebSpeechRecognition()
      } else {
        // Fallback to Deepgram for browsers without Web Speech API (like Firefox)
        console.log('Web Speech API not supported, using Deepgram fallback')
        toast({
          title: "Using Deepgram",
          description: "Your browser doesn't support Web Speech API"
        })
        startDeepgramRecording()
      }
    }
  }

  // File attachment handlers
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    // Close the attachment menu
    setShowAttachmentMenu(false)

    for (const file of Array.from(files)) {
      const reader = new FileReader()
      reader.onload = async (event) => {
        const base64 = event.target?.result as string
        const imageId = Date.now().toString() + Math.random()
        const controller = new AbortController()

        // Add image with processing state
        setAttachedImages((prev: AttachedImage[]) => [...prev, {
          id: imageId,
          name: file.name,
          base64,
          isProcessing: true,
          abortController: controller
        }])

        // Process image immediately via describe-image API
        try {
          const response = await fetch('/api/describe-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64 }),
            signal: controller.signal
          })

          if (!response.ok) {
            throw new Error('Failed to process image')
          }

          const result = await response.json()

          // Extract description from response
          let description: string
          if (result.specification) {
            description = `[UI SPECIFICATION]\n\`\`\`json\n${JSON.stringify(result.specification, null, 2)}\n\`\`\``
          } else if (result.description) {
            description = result.description
          } else {
            description = '[Image processed]'
          }

          // Update image with description
          setAttachedImages((prev: AttachedImage[]) => prev.map((img: AttachedImage) =>
            img.id === imageId ? { ...img, description, isProcessing: false, abortController: undefined } : img
          ))

          toast({
            title: "Image ready",
            description: "Image analyzed successfully"
          })
        } catch (error: any) {
          if (error.name === 'AbortError') {
            // User cancelled - remove the image
            setAttachedImages((prev: AttachedImage[]) => prev.filter((img: AttachedImage) => img.id !== imageId))
            toast({
              title: "Cancelled",
              description: "Image processing cancelled"
            })
          } else {
            console.error('Error processing image:', error)
            // Update image to show error state
            setAttachedImages((prev: AttachedImage[]) => prev.map((img: AttachedImage) =>
              img.id === imageId ? { ...img, description: '[Error processing image]', isProcessing: false, abortController: undefined } : img
            ))
            toast({
              title: "Error",
              description: "Failed to process image",
              variant: "destructive"
            })
          }
        }
      }
      reader.readAsDataURL(file)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    // Close the attachment menu
    setShowAttachmentMenu(false)

    for (const file of Array.from(files)) {
      const reader = new FileReader()
      reader.onload = (event) => {
        const content = event.target?.result as string
        setAttachedUploadedFiles((prev: AttachedUploadedFile[]) => [...prev, {
          id: Date.now().toString() + Math.random(),
          name: file.name,
          content,
          size: file.size
        }])
      }
      reader.readAsText(file)
    }
  }

  const handleUrlAttachment = async () => {
    if (!urlInput.trim()) return

    // Close the attachment menu
    setShowAttachmentMenu(false)

    const urlId = Date.now().toString()
    setAttachedUrls((prev: AttachedUrl[]) => [...prev, {
      id: urlId,
      url: urlInput,
      isProcessing: true
    }])
    setUrlInput('')
    setShowUrlDialog(false)

    // Fetch URL content
    try {
      console.log('🌐 Fetching URL content:', urlInput);

      const response = await fetch('/api/redesign', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: urlInput }),
      })

      if (!response.ok) {
        throw new Error('Failed to fetch URL content')
      }

      const data = await response.json()

      console.log('✅ URL content fetched:', {
        url: urlInput,
        contentLength: data.markdown?.length,
        hasContent: !!data.markdown
      })

      // Update URL with content (API returns markdown field)
      setAttachedUrls((prev: AttachedUrl[]) => prev.map((url: AttachedUrl) =>
        url.id === urlId ? { ...url, title: urlInput, content: data.markdown, isProcessing: false } : url
      ))
    } catch (error) {
      console.error('Error fetching URL:', error)
      setAttachedUrls((prev: AttachedUrl[]) => prev.map((url: AttachedUrl) =>
        url.id === urlId ? { ...url, isProcessing: false } : url
      ))
    }
  }

  return (
    <div className={`flex flex-col overflow-hidden ${isMobile ? 'h-[calc(100vh-9.5rem)]' : 'h-full'}`} style={{ backgroundColor: 'rgba(17, 24, 39, 0.8)' }}>
      {/* Messages Area - Scrollable container */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollContainerRef}
          className={`h-full min-w-0 overflow-y-auto overflow-x-hidden space-y-5 ${isMobile ? 'px-4 pt-4 pb-20' : 'px-4 pt-4 pb-4'}`}
          style={{ backgroundColor: 'rgba(17, 24, 39, 0.8)' }}
        >
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>Start a conversation with PiPilot...</p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              'flex min-w-0',
              message.role === 'user' ? 'justify-end' : 'justify-start'
            )}
          >
            {message.role === 'user' ? (
              <div className="max-w-[85%] min-w-0 ml-auto">
                <ExpandableUserMessage
                  content={message.content}
                  messageId={message.id}
                  images={message.images}
                  onCopy={handleCopyMessage}
                  onDelete={handleDeleteMessage}
                  onRetry={handleRetryMessage}
                  onRevert={handleRevertToCheckpoint}
                  onBranch={handleBranchFromMessage}
                  showRestore={restoreMessageId === message.id}
                />
              </div>
            ) : (
              <div className="w-full">
                <div className="py-1 break-words overflow-hidden" style={{ overflowWrap: 'anywhere' }}>
                  {/* Special Rendering: Supabase Connection Card */}
                  {(() => {
                    const toolCalls = activeToolCalls.get(message.id)
                    const supabaseConnectionCalls = toolCalls?.filter(tc =>
                      tc.toolName === 'request_supabase_connection' && tc.status === 'completed'
                    )

                    if (supabaseConnectionCalls && supabaseConnectionCalls.length > 0) {
                      return (
                        <div className="space-y-4 mb-4">
                          {supabaseConnectionCalls.map((toolCall) => {
                            // Try to extract data from the tool call input or result
                            const input = toolCall.input || {}
                            const title = input.title
                            const description = input.description
                            const labels = input.labels

                            return (
                              <SupabaseConnectionCard
                                key={toolCall.toolCallId}
                                title={title}
                                description={description}
                                labels={labels}
                              />
                            )
                          })}
                        </div>
                      )
                    }
                    return null
                  })()}

                  {/* Special Rendering: Continue Backend Implementation Card */}
                  {(() => {
                    const toolCalls = activeToolCalls.get(message.id)
                    const continueBackendCalls = toolCalls?.filter(tc =>
                      tc.toolName === 'continue_backend_implementation' && tc.status === 'completed'
                    )

                    if (continueBackendCalls && continueBackendCalls.length > 0) {
                      return (
                        <div className="space-y-4 mb-4">
                          {continueBackendCalls.map((toolCall) => {
                            // Try to extract data from the tool call input or result
                            const input = toolCall.input || {}
                            const title = input.title || "Continue Backend Implementation"
                            const description = input.description || "Automatically continue with backend development implementation"
                            const prompt = input.prompt

                            return (
                              <ContinueBackendCard
                                key={toolCall.toolCallId}
                                title={title}
                                description={description}
                                prompt={prompt}
                                onContinue={onContinueToBackend}
                              />
                            )
                          })}
                        </div>
                      )
                    }
                    return null
                  })()}

                  {/* Pass inline tool calls with positions to MessageWithTools for inline rendering */}
                  {(() => {
                    const toolCalls = activeToolCalls.get(message.id) || []
                    // Filter out tools with special rendering
                    const inlineToolCalls = toolCalls.filter(tc =>
                      tc.toolName !== 'request_supabase_connection' &&
                      tc.toolName !== 'continue_backend_implementation'
                    )
                    return (
                      <MessageWithTools
                        message={message}
                        projectId={project?.id}
                        isStreaming={(isLoading && message.id === messages[messages.length - 1]?.id) || message.id === continuingMessageId}
                        onContinueToBackend={onContinueToBackend}
                        inlineToolCalls={inlineToolCalls}
                      />
                    )
                  })()}

                  {/* Tool Activity Panel - Always show for summary/tracking purposes */}
                  {(() => {
                    const toolCalls = activeToolCalls.get(message.id)
                    // Filter out tools with special rendering (like request_supabase_connection, continue_backend_implementation)
                    const regularToolCalls = toolCalls?.filter(tc =>
                      tc.toolName !== 'request_supabase_connection' &&
                      tc.toolName !== 'continue_backend_implementation'
                    )
                    return regularToolCalls && regularToolCalls.length > 0 ? (
                      <ToolActivityPanel
                        toolCalls={regularToolCalls}
                        isStreaming={(isLoading && message.id === messages[messages.length - 1]?.id) || message.id === continuingMessageId}
                      />
                    ) : null
                  })()}
                </div>
                {/* AI Message Actions - Only show if message has content */}
                {message.content && message.content.trim().length > 0 && (
                  <div className="pt-1 flex items-center gap-1">
                    <Action
                      tooltip="Copy message"
                      onClick={() => handleCopyMessage(message.id, message.content)}
                    >
                      <Copy className="w-3.5 h-3.5 text-gray-500 hover:text-gray-300" />
                    </Action>
                    <Action
                      tooltip="Delete message"
                      onClick={() => handleDeleteMessage(message.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-gray-500 hover:text-gray-300" />
                    </Action>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Don't show separate loading spinner - MessageWithTools handles it */}

        <div ref={messagesEndRef} />
        </div>

        {/* Scroll to bottom button - Claude style */}
        {showScrollButton && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 h-8 w-8 rounded-full bg-gray-700/90 border border-gray-600/50 text-gray-300 hover:bg-gray-600/90 hover:text-white flex items-center justify-center shadow-lg backdrop-blur-sm transition-all"
            aria-label="Scroll to bottom"
          >
            <ArrowDown className="size-4" />
          </button>
        )}
      </div>

      {/* Input Area - Fixed at bottom */}
      <div className={`px-3 pb-3 pt-2 ${isMobile
        ? 'fixed bottom-12 left-0 right-0 z-[60]'
        : ''
        }`} style={{ backgroundColor: 'rgba(17, 24, 39, 0.8)' }}>

        {/* Prompt Queue - Collapsible accordion with Claude-style badges */}
        {promptQueue.length > 0 && (
          <div className="mb-2">
            <button
              className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-300 transition-colors mb-1"
              onClick={() => {
                const el = document.getElementById('queue-accordion')
                if (el) el.classList.toggle('hidden')
              }}
            >
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 text-[11px] font-medium">
                {promptQueue.length} queued
              </span>
              {promptQueue.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); clearQueue() }}
                  className="text-[11px] text-gray-500 hover:text-red-400 transition-colors"
                >
                  Clear all
                </button>
              )}
            </button>
            <div id="queue-accordion" className="flex flex-col gap-1">
              {promptQueue.map((item, index) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gray-800/60 text-xs group"
                >
                  <span className="text-gray-500 font-mono text-[10px] flex-shrink-0">#{index + 1}</span>
                  <span className="truncate text-gray-300 flex-1">{item.text}</span>
                  <button
                    onClick={() => removeFromQueue(item.id)}
                    className="opacity-0 group-hover:opacity-100 hover:text-red-400 text-gray-500 transition-all flex-shrink-0"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main Input Container - Claude-style rounded card */}
        <div className="relative rounded-2xl border border-gray-700/60 bg-gray-900/80 focus-within:border-gray-600 transition-colors">

          {/* Tagged Component Context */}
          {taggedComponent && (
            <div className="px-3 pt-2.5">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-blue-950/30 border border-blue-800/40 text-xs">
                <Square className="size-3 text-blue-400" />
                <span className="font-medium text-blue-300">&lt;{taggedComponent.tagName}&gt;</span>
                {taggedComponent.sourceFile && (
                  <span className="text-blue-400/60">{taggedComponent.sourceFile}{taggedComponent.sourceLine && `:${taggedComponent.sourceLine}`}</span>
                )}
                <button onClick={onClearTaggedComponent} className="hover:text-red-400 text-blue-400/60 transition-colors">
                  <X className="size-3" />
                </button>
              </div>
            </div>
          )}

          {/* Attachments inside the card */}
          {(attachedFiles.length > 0 || attachedImages.length > 0 || attachedUploadedFiles.length > 0 || attachedUrls.length > 0 || attachedSearchContexts.length > 0) && (
            <div className="px-3 pt-2.5 flex flex-wrap gap-1.5">
              {attachedFiles.map((file: AttachedFile) => (
                <div key={file.id} className="flex items-center gap-1.5 bg-gray-800 px-2 py-1 rounded-lg text-xs text-gray-300 group">
                  <FileText className="size-3 text-gray-500" />
                  <span className="truncate max-w-[120px]">{file.name}</span>
                  <button className="opacity-0 group-hover:opacity-100 hover:text-red-400 text-gray-500 transition-all" onClick={() => setAttachedFiles((prev: AttachedFile[]) => prev.filter((f: AttachedFile) => f.id !== file.id))}>
                    <X className="size-3" />
                  </button>
                </div>
              ))}
              {attachedImages.map((img: AttachedImage) => (
                <div key={img.id} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs group ${img.isProcessing ? 'bg-blue-900/30 text-blue-300' : 'bg-gray-800 text-gray-300'}`}>
                  <ImageIcon className="size-3 text-gray-500" />
                  <span className="truncate max-w-[120px]">{img.name}</span>
                  {img.isProcessing ? (
                    <>
                      <Loader2 className="size-3 animate-spin text-blue-400" />
                      <button onClick={() => { if (img.abortController) img.abortController.abort() }} className="hover:text-red-400 text-blue-400/60 transition-colors">
                        <X className="size-3" />
                      </button>
                    </>
                  ) : (
                    <button className="opacity-0 group-hover:opacity-100 hover:text-red-400 text-gray-500 transition-all" onClick={() => setAttachedImages((prev: AttachedImage[]) => prev.filter((i: AttachedImage) => i.id !== img.id))}>
                      <X className="size-3" />
                    </button>
                  )}
                </div>
              ))}
              {attachedUploadedFiles.map((file: AttachedUploadedFile) => (
                <div key={file.id} className="flex items-center gap-1.5 bg-gray-800 px-2 py-1 rounded-lg text-xs text-gray-300 group">
                  <FileText className="size-3 text-gray-500" />
                  <span className="truncate max-w-[120px]">{file.name}</span>
                  <button className="opacity-0 group-hover:opacity-100 hover:text-red-400 text-gray-500 transition-all" onClick={() => setAttachedUploadedFiles((prev: AttachedUploadedFile[]) => prev.filter((f: AttachedUploadedFile) => f.id !== file.id))}>
                    <X className="size-3" />
                  </button>
                </div>
              ))}
              {attachedUrls.map((url: AttachedUrl) => (
                <div key={url.id} className="flex items-center gap-1.5 bg-gray-800 px-2 py-1 rounded-lg text-xs text-gray-300 group">
                  <LinkIcon className="size-3 text-gray-500" />
                  <span className="truncate max-w-[120px]">{url.title || url.url}</span>
                  {url.isProcessing && <Loader2 className="size-3 animate-spin text-gray-400" />}
                  <button className="opacity-0 group-hover:opacity-100 hover:text-red-400 text-gray-500 transition-all" onClick={() => setAttachedUrls((prev: AttachedUrl[]) => prev.filter((u: AttachedUrl) => u.id !== url.id))}>
                    <X className="size-3" />
                  </button>
                </div>
              ))}
              {attachedSearchContexts.map((ctx: AttachedSearchContext) => (
                <SearchContextPill
                  key={ctx.id}
                  context={ctx}
                  onRemove={() => handleRemoveSearchContext(ctx.id)}
                  onClick={() => handleOpenFileFromSearch(ctx.filePath, ctx.lineNumber)}
                />
              ))}
            </div>
          )}

          {/* Credit Alert - inside card top */}
          {!loadingCredits && creditBalance !== null && creditBalance <= 3 && (
            <div className="px-3 pt-2">
              <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-yellow-950/20 border border-yellow-800/30 text-xs">
                <AlertTriangle className="h-3 w-3 text-yellow-500" />
                <span className="text-yellow-400 font-medium">{creditBalance.toFixed(1)} credits</span>
                {(() => {
                  const planConfig = PRODUCT_CONFIGS[currentPlan]
                  const canPurchase = planConfig ? planConfig.limits.canPurchaseCredits : false
                  return canPurchase ? (
                    <button className="text-yellow-500 hover:text-yellow-300 font-medium ml-1 transition-colors" onClick={() => setShowTopUpDialog(true)}>Buy</button>
                  ) : (
                    <button className="text-yellow-500 hover:text-yellow-300 font-medium ml-1 transition-colors" onClick={() => window.location.href = '/pricing'}>Upgrade</button>
                  )
                })()}
              </div>
            </div>
          )}

          {/* Textarea */}
          <form data-chat-form onSubmit={handleEnhancedSubmit}>
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                const newValue = e.target.value
                setInput(newValue)

                // Slash command detection (when starting with /)
                if (newValue.startsWith('/')) {
                  const query = newValue.slice(1) // Remove "/"
                  const rect = textareaRef.current?.getBoundingClientRect()
                  if (rect) {
                    slashCommands.open({ top: rect.top, left: rect.left + 10 })
                    slashCommands.updateQuery(query)
                  }
                } else {
                  slashCommands.close()
                }

                // Lightweight synchronous @ command detection (only if @ is present)
                if (textareaRef.current && project && newValue.includes('@')) {
                  const atCommand = detectAtCommand(newValue, e.target.selectionStart)
                  if (atCommand) {
                    // Update state only when query or visibility changes to avoid re-renders
                    if (!showFileDropdown || fileQuery !== atCommand.query || atCommandStartIndex !== atCommand.startIndex) {
                      setFileQuery(atCommand.query)
                      setAtCommandStartIndex(atCommand.startIndex)
                      const position = calculateDropdownPosition(textareaRef.current, atCommand.startIndex)
                      setDropdownPosition(position)
                      setShowFileDropdown(true)
                    }
                  } else if (showFileDropdown) {
                    closeFileDropdown()
                  }
                } else if (showFileDropdown) {
                  // Close dropdown if no @ in text
                  closeFileDropdown();
                }

                // Trigger height adjustment
                setTimeout(() => {
                  if (textareaRef.current) {
                    debouncedHeightAdjustment(textareaRef.current)
                  }
                }, 0)
              }}
              placeholder="Type, @ for files, paste images or URLs, or attach..."
              className="min-h-[44px] max-h-[140px] resize-none border-0 bg-transparent text-gray-100 placeholder:text-gray-500 focus-visible:ring-0 focus-visible:ring-offset-0 px-3.5 pt-3 pb-2 text-sm"
              onKeyDown={(e: any) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleEnhancedSubmit(e)
                }
              }}
              onPaste={async (e) => {
                // Handle image pasting
                const items = e.clipboardData?.items
                if (!items) return

                // TEMPORARILY DISABLED: Check for URLs in pasted text first
                /*
                const pastedText = e.clipboardData?.getData('text')
                if (pastedText) {
                  // URL regex pattern
                  const urlRegex = /(https?:\/\/[^\s]+)/g
                  const urls = pastedText.match(urlRegex)
                  
                  if (urls && urls.length > 0) {
                    e.preventDefault()
                    
                    // Check total attachment limit
                    const totalAttachments = attachedImages.length + attachedUploadedFiles.length + attachedUrls.length
                    if (totalAttachments >= 2) {
                      toast({
                        title: "Maximum attachments reached",
                        description: "You can attach a maximum of 2 items (images, files, and/or URLs)",
                        variant: "destructive"
                      })
                      return
                    }
                    
                    // Process each URL
                    for (const url of urls.slice(0, 2 - totalAttachments)) { // Limit to remaining slots
                      const urlId = `pasted_url_${Date.now()}_${Math.random()}`
                      
                      // Add URL with processing flag
                      setAttachedUrls(prev => [...prev, {
                        id: urlId,
                        url: url,
                        isProcessing: true
                      }])
                      
                      // Fetch URL content
                      try {
                        console.log('🌐 Auto-attaching pasted URL:', url);
                        
                        const response = await fetch('/api/redesign', {
                          method: 'PUT',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({ url: url }),
                        })
                        
                        if (!response.ok) {
                          throw new Error('Failed to fetch URL content')
                        }
                        
                        const data = await response.json()
                        
                        console.log('✅ URL content fetched:', {
                          url: url,
                          contentLength: data.markdown?.length,
                          hasContent: !!data.markdown
                        })
                        
                        // Update URL with content
                        setAttachedUrls(prev => prev.map((attachedUrl: AttachedUrl) =>
                          attachedUrl.id === urlId 
                            ? { ...attachedUrl, title: url, content: data.markdown, isProcessing: false } 
                            : attachedUrl
                        ))
                        
                        toast({
                          title: "URL attached",
                          description: `Auto-attached ${url}`
                        })
                      } catch (error) {
                        console.error('Error fetching pasted URL:', error)
                        toast({
                          title: "URL attachment failed",
                          description: `Failed to attach ${url}`,
                          variant: "destructive"
                        })
                        setAttachedUrls(prev => prev.filter(attachedUrl => attachedUrl.id !== urlId))
                      }
                    }
                    
                    return // Don't process images if URLs were found
                  }
                }
                */

                // Handle image pasting - supports multiple images up to MAX_IMAGE_ATTACHMENTS
                const imageItems: DataTransferItem[] = []
                for (let i = 0; i < items.length; i++) {
                  if (items[i].type.indexOf('image') !== -1) {
                    imageItems.push(items[i])
                  }
                }

                if (imageItems.length === 0) return

                e.preventDefault()

                // Check how many more images we can add
                const currentImageCount = attachedImages.length
                const remainingSlots = MAX_IMAGE_ATTACHMENTS - currentImageCount

                if (remainingSlots <= 0) {
                  toast({
                    title: "Maximum images reached",
                    description: `You can attach a maximum of ${MAX_IMAGE_ATTACHMENTS} images`,
                    variant: "destructive"
                  })
                  return
                }

                // Limit to remaining slots
                const imagesToProcess = imageItems.slice(0, remainingSlots)

                if (imagesToProcess.length < imageItems.length) {
                  toast({
                    title: "Some images skipped",
                    description: `Only ${imagesToProcess.length} of ${imageItems.length} images added (limit: ${MAX_IMAGE_ATTACHMENTS})`,
                  })
                }

                // Process each image - always through describe-image API
                imagesToProcess.forEach((item, index) => {
                  const file = item.getAsFile()
                  if (!file) return

                  // Validate file size (max 10MB)
                  if (file.size > 10 * 1024 * 1024) {
                    toast({
                      title: "File too large",
                      description: "Pasted image is too large. Maximum size is 10MB",
                      variant: "destructive"
                    })
                    return
                  }

                  // Convert to base64
                  const reader = new FileReader()
                  reader.onload = async (event) => {
                    const base64 = event.target?.result as string
                    const imageId = `pasted_img_${Date.now()}_${index}`
                    const controller = new AbortController()

                    // Add image with processing state
                    setAttachedImages(prev => {
                      const newImageNumber = prev.length + 1
                      return [...prev, {
                        id: imageId,
                        name: `Pasted Image ${newImageNumber}`,
                        base64: base64,
                        isProcessing: true,
                        abortController: controller
                      }]
                    })

                    // Process image immediately via describe-image API
                    try {
                      const response = await fetch('/api/describe-image', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ image: base64 }),
                        signal: controller.signal
                      })

                      if (!response.ok) {
                        throw new Error('Failed to process image')
                      }

                      const result = await response.json()

                      // Extract description from response
                      let description: string
                      if (result.specification) {
                        description = `[UI SPECIFICATION]\n\`\`\`json\n${JSON.stringify(result.specification, null, 2)}\n\`\`\``
                      } else if (result.description) {
                        description = result.description
                      } else {
                        description = '[Image processed]'
                      }

                      // Update image with description
                      setAttachedImages(prev => prev.map((img: AttachedImage) =>
                        img.id === imageId ? { ...img, description, isProcessing: false, abortController: undefined } : img
                      ))

                      toast({
                        title: "Image ready",
                        description: "Image analyzed successfully"
                      })
                    } catch (error: any) {
                      if (error.name === 'AbortError') {
                        // User cancelled - remove the image
                        setAttachedImages(prev => prev.filter((img: AttachedImage) => img.id !== imageId))
                        toast({
                          title: "Cancelled",
                          description: "Image processing cancelled"
                        })
                      } else {
                        console.error('Error processing pasted image:', error)
                        // Update image to show error state
                        setAttachedImages(prev => prev.map((img: AttachedImage) =>
                          img.id === imageId ? { ...img, description: '[Error processing image]', isProcessing: false, abortController: undefined } : img
                        ))
                        toast({
                          title: "Error",
                          description: "Failed to process image",
                          variant: "destructive"
                        })
                      }
                    }
                  }

                  reader.onerror = () => {
                    toast({
                      title: "Read error",
                      description: "Failed to read pasted image",
                      variant: "destructive"
                    })
                  }

                  reader.readAsDataURL(file)
                })
              }}
            />
          </form>

          {/* Hidden file inputs */}
          <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" id="image-upload" />
          <input type="file" multiple onChange={handleFileUpload} className="hidden" id="file-upload" />

          {/* Bottom Bar inside the card */}
          <div className="flex items-center justify-between px-2 pb-2">
            {/* Left Side: + Command Menu and Voice */}
            <div className="flex items-center gap-1">
              {/* + Command Menu Button */}
              <div className="relative" ref={commandMenuRef}>
                <button
                  type="button"
                  className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
                  onClick={() => {
                    setShowCommandMenu(!showCommandMenu)
                    setCommandMenuSubmenu('none')
                    setToolDetailCategory(null)
                  }}
                >
                  <Plus className={`size-4 transition-transform ${showCommandMenu ? 'rotate-45' : ''}`} />
                </button>

                {/* Command Menu Palette */}
                {showCommandMenu && (
                  <div className="absolute bottom-10 left-0 w-[280px] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-[80] overflow-hidden">
                    {commandMenuSubmenu === 'none' && (
                      <div className="py-1.5">
                        {/* Attachments Section */}
                        <button
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 transition-colors"
                          onClick={() => {
                            setShowCommandMenu(false)
                            document.getElementById('image-upload')?.click()
                          }}
                        >
                          <FileUp className="size-4 text-gray-400" />
                          <span>Add images or files</span>
                        </button>
                        <button
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 transition-colors"
                          onClick={() => {
                            setShowCommandMenu(false)
                            setShowUrlDialog(true)
                          }}
                        >
                          <LinkIcon className="size-4 text-gray-400" />
                          <span>Attach URL</span>
                        </button>
                        <button
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 transition-colors"
                          onClick={() => {
                            setShowCommandMenu(false)
                            // Trigger @ file dropdown
                            if (textareaRef.current) {
                              const currentVal = input
                              setInput(currentVal + '@')
                              textareaRef.current.focus()
                              setTimeout(() => {
                                if (textareaRef.current) {
                                  const pos = textareaRef.current.value.length
                                  textareaRef.current.selectionStart = pos
                                  textareaRef.current.selectionEnd = pos
                                  const atCmd = detectAtCommand(textareaRef.current.value, pos)
                                  if (atCmd) {
                                    setFileQuery(atCmd.query)
                                    setAtCommandStartIndex(atCmd.startIndex)
                                    const position = calculateDropdownPosition(textareaRef.current, atCmd.startIndex)
                                    setDropdownPosition(position)
                                    setShowFileDropdown(true)
                                  }
                                }
                              }, 50)
                            }
                          }}
                        >
                          <FolderOpen className="size-4 text-gray-400" />
                          <span>Browse project files</span>
                        </button>

                        {/* Separator */}
                        <div className="my-1.5 border-t border-gray-700/50" />

                        {/* Feature Toggles */}
                        <button
                          className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 transition-colors"
                          onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                        >
                          <div className="flex items-center gap-3">
                            <Globe className="size-4 text-gray-400" />
                            <span>Web search</span>
                          </div>
                          {webSearchEnabled && <Check className="size-4 text-green-400" />}
                        </button>
                        <button
                          className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 transition-colors"
                          onClick={() => setIsAskMode(!isAskMode)}
                        >
                          <div className="flex items-center gap-3">
                            <Eye className="size-4 text-gray-400" />
                            <span>Plan mode</span>
                          </div>
                          {isAskMode && <Check className="size-4 text-green-400" />}
                        </button>
                        <button
                          className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 transition-colors"
                          onClick={() => setImageGenEnabled(!imageGenEnabled)}
                        >
                          <div className="flex items-center gap-3">
                            <Sparkles className="size-4 text-gray-400" />
                            <span>Image generation</span>
                          </div>
                          {imageGenEnabled && <Check className="size-4 text-green-400" />}
                        </button>

                        {/* Separator */}
                        <div className="my-1.5 border-t border-gray-700/50" />

                        {/* Submenus */}
                        <button
                          className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 transition-colors"
                          onClick={() => setCommandMenuSubmenu('mcp')}
                        >
                          <div className="flex items-center gap-3">
                            <Server className="size-4 text-gray-400" />
                            <span>MCP Servers</span>
                            {loadedMcpServers.filter(s => mcpServerToggles[s.id || s.name] !== false).length > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-green-900/40 text-green-400 rounded-full">
                                {loadedMcpServers.filter(s => mcpServerToggles[s.id || s.name] !== false).length}
                              </span>
                            )}
                          </div>
                          <ChevronRight className="size-4 text-gray-500" />
                        </button>
                        <button
                          className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 transition-colors"
                          onClick={() => setCommandMenuSubmenu('tools')}
                        >
                          <div className="flex items-center gap-3">
                            <Wrench className="size-4 text-gray-400" />
                            <span>Tool categories</span>
                          </div>
                          <ChevronRight className="size-4 text-gray-500" />
                        </button>

                        {/* Separator */}
                        <div className="my-1.5 border-t border-gray-700/50" />

                        {/* Slash commands */}
                        <button
                          className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 transition-colors"
                          onClick={() => setCommandMenuSubmenu('slash')}
                        >
                          <div className="flex items-center gap-3">
                            <Hash className="size-4 text-gray-400" />
                            <span>Slash commands</span>
                          </div>
                          <ChevronRight className="size-4 text-gray-500" />
                        </button>

                        {/* Project Settings */}
                        <button
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 transition-colors"
                          onClick={() => {
                            setShowCommandMenu(false)
                            if (project?.slug) {
                              window.open(`/workspace/projects/${project.slug}`, '_blank')
                            }
                          }}
                        >
                          <Settings className="size-4 text-gray-400" />
                          <span>Project settings</span>
                        </button>
                      </div>
                    )}

                    {/* MCP Servers Submenu */}
                    {commandMenuSubmenu === 'mcp' && (
                      <div className="py-1.5">
                        <button
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 transition-colors border-b border-gray-700/50"
                          onClick={() => setCommandMenuSubmenu('none')}
                        >
                          <ChevronLeft className="size-4" />
                          <span className="font-medium">MCP Servers</span>
                        </button>
                        {loadedMcpServers.length === 0 ? (
                          <div className="px-4 py-4 text-sm text-gray-500 text-center">
                            No MCP servers configured
                          </div>
                        ) : (
                          <div className="max-h-[240px] overflow-y-auto">
                            {loadedMcpServers.map((server) => {
                              const key = server.id || server.name
                              const isOn = mcpServerToggles[key] !== false
                              return (
                                <button
                                  key={key}
                                  className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 transition-colors"
                                  onClick={() => setMcpServerToggles(prev => ({ ...prev, [key]: !isOn }))}
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <Server className={`size-4 flex-shrink-0 ${isOn ? 'text-green-400' : 'text-gray-500'}`} />
                                    <span className="truncate">{server.name}</span>
                                    {server.transport === 'stdio' && (
                                      <span className="text-[10px] px-1 py-0.5 bg-yellow-900/30 text-yellow-500 rounded flex-shrink-0">local</span>
                                    )}
                                  </div>
                                  <Switch
                                    checked={isOn}
                                    onCheckedChange={(checked) => setMcpServerToggles(prev => ({ ...prev, [key]: checked }))}
                                    className="h-4 w-7 flex-shrink-0"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </button>
                              )
                            })}
                          </div>
                        )}
                        <div className="border-t border-gray-700/50 mt-1">
                          <button
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-blue-400 hover:bg-gray-800 transition-colors"
                            onClick={() => {
                              setShowCommandMenu(false)
                              if (project?.slug) {
                                window.open(`/workspace/projects/${project.slug}?tab=mcp`, '_blank')
                              }
                            }}
                          >
                            <ExternalLink className="size-4" />
                            <span>Manage servers</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Tool Categories Submenu (with drill-down into individual tools) */}
                    {commandMenuSubmenu === 'tools' && (
                      <div className="py-1.5">
                        {/* Category list or individual tools drill-down */}
                        {toolDetailCategory === null ? (
                          <>
                            <button
                              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 transition-colors border-b border-gray-700/50"
                              onClick={() => setCommandMenuSubmenu('none')}
                            >
                              <ChevronLeft className="size-4" />
                              <span className="font-medium">Tool Categories</span>
                            </button>
                            <div className="max-h-[280px] overflow-y-auto">
                              {[
                                { id: 'file_ops', label: 'File Operations', icon: FileText, desc: 'Read, write, edit, delete files' },
                                { id: 'code_search', label: 'Code Search', icon: Search, desc: 'Grep, semantic nav, list files' },
                                { id: 'web_tools', label: 'Web Tools', icon: Globe, desc: 'Web search & extraction' },
                                { id: 'dev_tools', label: 'Dev Tools', icon: Code, desc: 'Error check, Node, packages' },
                                { id: 'pipilot_db', label: 'PiPilot Database', icon: Database, desc: 'Create/query PiPilot databases' },
                                { id: 'supabase', label: 'Supabase', icon: Database, desc: 'Supabase tables, auth, storage' },
                                { id: 'stripe', label: 'Stripe', icon: CreditCard, desc: 'Payments, products, customers' },
                                { id: 'docs_quality', label: 'Docs & Quality', icon: BarChart3, desc: 'Reports, docs, code review' },
                                { id: 'image_gen', label: 'Image Generation', icon: Sparkles, desc: 'AI image generation' },
                              ].map((cat) => {
                                const isOn = toolCategoryToggles[cat.id] !== false
                                const Icon = cat.icon
                                const tools = clientCategoryToolMap[cat.id] || []
                                const disabledCount = isOn ? tools.filter(t => disabledIndividualTools.includes(t.name)).length : tools.length
                                return (
                                  <div key={cat.id} className="flex items-center hover:bg-gray-800 transition-colors">
                                    {/* Category info - click to drill down */}
                                    <button
                                      className="flex-1 flex items-center gap-3 px-4 py-2 text-sm text-gray-200 min-w-0"
                                      onClick={() => setToolDetailCategory(cat.id)}
                                    >
                                      <Icon className={`size-4 flex-shrink-0 ${isOn ? 'text-blue-400' : 'text-gray-600'}`} />
                                      <div className="text-left min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                          <span className={isOn ? 'text-gray-200' : 'text-gray-500'}>{cat.label}</span>
                                          {isOn && disabledCount > 0 && (
                                            <span className="text-[10px] px-1.5 py-0.5 bg-yellow-900/30 text-yellow-500 rounded-full">
                                              {tools.length - disabledCount}/{tools.length}
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-[11px] text-gray-500 truncate">{cat.desc}</div>
                                      </div>
                                      <ChevronRight className="size-3.5 text-gray-600 flex-shrink-0" />
                                    </button>
                                    {/* Category master toggle */}
                                    <div className="px-3">
                                      <Switch
                                        checked={isOn}
                                        onCheckedChange={(checked) => {
                                          setToolCategoryToggles(prev => ({ ...prev, [cat.id]: checked }))
                                          // When enabling category, also re-enable all its individual tools
                                          if (checked) {
                                            const toolNames = tools.map(t => t.name)
                                            setDisabledIndividualTools(prev => prev.filter(t => !toolNames.includes(t)))
                                          }
                                        }}
                                        className="h-4 w-7 flex-shrink-0"
                                      />
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                            <div className="border-t border-gray-700/50 mt-1">
                              <button
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-blue-400 hover:bg-gray-800 transition-colors"
                                onClick={() => {
                                  setShowCommandMenu(false)
                                  window.open('/workspace/account', '_blank')
                                }}
                              >
                                <ExternalLink className="size-4" />
                                <span>Manage in settings</span>
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            {/* Individual tools drill-down */}
                            {(() => {
                              const catId = toolDetailCategory
                              const catLabels: Record<string, string> = {
                                file_ops: 'File Operations', code_search: 'Code Search', web_tools: 'Web Tools',
                                dev_tools: 'Dev Tools', pipilot_db: 'PiPilot Database', supabase: 'Supabase',
                                stripe: 'Stripe', docs_quality: 'Docs & Quality', image_gen: 'Image Generation',
                              }
                              const tools = clientCategoryToolMap[catId] || []
                              const categoryEnabled = toolCategoryToggles[catId] !== false
                              const enabledToolCount = tools.filter(t => !disabledIndividualTools.includes(t.name)).length
                              return (
                                <>
                                  <button
                                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 transition-colors border-b border-gray-700/50"
                                    onClick={() => setToolDetailCategory(null)}
                                  >
                                    <ChevronLeft className="size-4" />
                                    <span className="font-medium">{catLabels[catId] || catId}</span>
                                    <span className="text-[11px] text-gray-500 ml-auto">{enabledToolCount}/{tools.length} active</span>
                                  </button>

                                  {/* Master toggle for this category */}
                                  <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700/30">
                                    <span className="text-xs text-gray-400">Enable all</span>
                                    <div className="flex items-center gap-2">
                                      <button
                                        className="text-[11px] text-blue-400 hover:text-blue-300"
                                        onClick={() => {
                                          // Enable all tools in this category
                                          const toolNames = tools.map(t => t.name)
                                          setDisabledIndividualTools(prev => prev.filter(t => !toolNames.includes(t)))
                                          if (!categoryEnabled) {
                                            setToolCategoryToggles(prev => ({ ...prev, [catId]: true }))
                                          }
                                        }}
                                      >
                                        All on
                                      </button>
                                      <span className="text-gray-600">|</span>
                                      <button
                                        className="text-[11px] text-red-400 hover:text-red-300"
                                        onClick={() => {
                                          // Disable all tools in this category
                                          const toolNames = tools.map(t => t.name)
                                          setDisabledIndividualTools(prev => [...prev.filter(t => !toolNames.includes(t)), ...toolNames])
                                        }}
                                      >
                                        All off
                                      </button>
                                    </div>
                                  </div>

                                  <div className="max-h-[240px] overflow-y-auto">
                                    {tools.map((tool) => {
                                      const isToolOn = categoryEnabled && !disabledIndividualTools.includes(tool.name)
                                      return (
                                        <button
                                          key={tool.name}
                                          className="w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-gray-800 transition-colors"
                                          onClick={() => {
                                            if (!categoryEnabled) {
                                              // Auto-enable category when enabling a tool
                                              setToolCategoryToggles(prev => ({ ...prev, [catId]: true }))
                                            }
                                            setDisabledIndividualTools(prev =>
                                              prev.includes(tool.name)
                                                ? prev.filter(t => t !== tool.name)
                                                : [...prev, tool.name]
                                            )
                                          }}
                                        >
                                          <div className="flex items-center gap-3 min-w-0">
                                            <Wrench className={`size-3.5 flex-shrink-0 ${isToolOn ? 'text-green-400' : 'text-gray-600'}`} />
                                            <div className="text-left min-w-0">
                                              <div className={`text-sm ${isToolOn ? 'text-gray-200' : 'text-gray-500'}`}>{tool.label}</div>
                                              <div className="text-[10px] text-gray-600 font-mono truncate">{tool.name}</div>
                                            </div>
                                          </div>
                                          <Switch
                                            checked={isToolOn}
                                            onCheckedChange={(checked) => {
                                              if (!categoryEnabled && checked) {
                                                setToolCategoryToggles(prev => ({ ...prev, [catId]: true }))
                                              }
                                              setDisabledIndividualTools(prev =>
                                                checked
                                                  ? prev.filter(t => t !== tool.name)
                                                  : [...prev, tool.name]
                                              )
                                            }}
                                            className="h-4 w-7 flex-shrink-0"
                                            onClick={(e) => e.stopPropagation()}
                                          />
                                        </button>
                                      )
                                    })}
                                  </div>
                                </>
                              )
                            })()}
                          </>
                        )}
                      </div>
                    )}

                    {/* Slash Commands Submenu */}
                    {commandMenuSubmenu === 'slash' && (
                      <div className="py-1.5">
                        <button
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 transition-colors border-b border-gray-700/50"
                          onClick={() => setCommandMenuSubmenu('none')}
                        >
                          <ChevronLeft className="size-4" />
                          <span className="font-medium">Slash Commands</span>
                        </button>
                        <div className="max-h-[240px] overflow-y-auto">
                          {getDefaultSlashCommands({}).map((cmd: SlashCommand) => (
                            <button
                              key={cmd.id}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 transition-colors"
                              onClick={() => {
                                setShowCommandMenu(false)
                                setInput(`/${cmd.id} `)
                                textareaRef.current?.focus()
                              }}
                            >
                              <Hash className="size-4 text-gray-500" />
                              <div className="text-left min-w-0">
                                <div className="text-gray-200">/{cmd.id}</div>
                                <div className="text-[11px] text-gray-500 truncate">{cmd.description}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Voice Button - Waveform icon */}
              <button
                type="button"
                className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                onClick={handleMicrophoneClick}
                disabled={isTranscribing}
              >
                {isRecording ? (
                  <svg width="16" height="16" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-red-400 animate-pulse">
                    <rect x="0" y="7.5" height="6" fill="currentColor" width="1" rx="0.5" ry="0.5" />
                    <rect x="4" y="5.5" height="10" fill="currentColor" width="1" rx="0.5" ry="0.5" />
                    <rect x="8" y="2.5" height="16" fill="currentColor" width="1" rx="0.5" ry="0.5" />
                    <rect x="12" y="5.5" height="10" fill="currentColor" width="1" rx="0.5" ry="0.5" />
                    <rect x="16" y="2.5" height="16" fill="currentColor" width="1" rx="0.5" ry="0.5" />
                    <rect x="20" y="7.5" height="6" fill="currentColor" width="1" rx="0.5" ry="0.5" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="0" y="7.5" height="6" fill="currentColor" fillOpacity="0.5" width="1" rx="0.5" ry="0.5" />
                    <rect x="4" y="5.5" height="10" fill="currentColor" fillOpacity="0.5" width="1" rx="0.5" ry="0.5" />
                    <rect x="8" y="2.5" height="16" fill="currentColor" fillOpacity="0.5" width="1" rx="0.5" ry="0.5" />
                    <rect x="12" y="5.5" height="10" fill="currentColor" fillOpacity="0.5" width="1" rx="0.5" ry="0.5" />
                    <rect x="16" y="2.5" height="16" fill="currentColor" fillOpacity="0.5" width="1" rx="0.5" ry="0.5" />
                    <rect x="20" y="7.5" height="6" fill="currentColor" fillOpacity="0.5" width="1" rx="0.5" ry="0.5" />
                  </svg>
                )}
              </button>
            </div>

            {/* Right Side: Model Selector, Plan Toggle, Send/Stop */}
            <div className="flex items-center gap-2">
              {/* Compact Model Selector */}
              {onModelChange && (
                <ModelSelector
                  selectedModel={selectedModel}
                  onModelChange={onModelChange}
                  userPlan={userPlan}
                  subscriptionStatus={subscriptionStatus}
                  compact={true}
                  className=""
                />
              )}

              {/* Plan Mode Toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className={`text-sm font-medium transition-colors ${isAskMode
                      ? 'text-blue-400'
                      : 'text-gray-400 hover:text-gray-200'
                    }`}
                    onClick={() => setIsAskMode(!isAskMode)}
                  >
                    Plan
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Plan mode - AI reasons and plans without making file changes</p>
                </TooltipContent>
              </Tooltip>

              {/* Send/Stop Button */}
              {isLoading ? (
                <button
                  type="button"
                  className="h-7 w-7 rounded-lg bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
                  onClick={handleStop}
                >
                  <Square className="w-3.5 h-3.5 text-white fill-white" />
                </button>
              ) : (
                <button
                  ref={sendButtonRef}
                  type="button"
                  className="h-7 w-7 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                  disabled={(!input.trim() && attachedFiles.length === 0 && attachedImages.length === 0) || attachedImages.some((img: AttachedImage) => img.isProcessing)}
                  onClick={handleEnhancedSubmit}
                >
                  <ArrowUp className="size-4 text-white" />
                </button>
              )}
            </div>
          </div>
        </div>



        {/* URL Attachment Dialog */}
        <AlertDialog open={showUrlDialog} onOpenChange={setShowUrlDialog}>
          <AlertDialogContent className="bg-gray-900 border-gray-700 z-[70]">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">Attach Website URL</AlertDialogTitle>
              <AlertDialogDescription className="text-gray-400">
                Enter a website URL to fetch its content. The AI will analyze the website structure and content.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
              <input
                type="url"
                placeholder="https://example.com"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleUrlAttachment()
                  }
                }}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                autoFocus
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-gray-700 text-gray-300 hover:bg-gray-600">
                Cancel
              </AlertDialogCancel>
              <button
                onClick={handleUrlAttachment}
                disabled={!urlInput.trim()}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Attach URL
              </button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* File Attachment Dropdown (@ command) */}
        {showFileDropdown && project && (
          <FileAttachmentDropdown
            isVisible={showFileDropdown}
            onClose={closeFileDropdown}
            onFileSelect={handleFileSelect}
            projectId={project.id}
            query={fileQuery}
            position={dropdownPosition}
          />
        )}

        {/* Checkpoint Revert Confirmation Dialog */}
        <AlertDialog open={showRevertDialog} onOpenChange={setShowRevertDialog}>
          <AlertDialogContent className="bg-gray-900 border-gray-700 z-[70]">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">Revert to Checkpoint?</AlertDialogTitle>
              <AlertDialogDescription className="text-gray-400">
                This will restore all files to their state at this message and remove all messages after it. You can restore within 5 minutes if needed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                className="bg-gray-700 text-gray-300 hover:bg-gray-600"
                onClick={cancelRevert}
              >
                Cancel
              </AlertDialogCancel>
              <button
                onClick={confirmRevert}
                className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-500 transition-colors"
              >
                Revert
              </button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Credit Top-Up Dialog */}
        <Dialog open={showTopUpDialog} onOpenChange={setShowTopUpDialog}>
          <DialogContent className={`${isMobile ? 'z-[80]' : ''} bg-gray-900 border-white/10`}>
            <DialogHeader>
              <DialogTitle className="text-white">Buy Credits</DialogTitle>
              <DialogDescription className="text-gray-400">
                Purchase additional credits for your {currentPlan} plan. $1 = 1 credit.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="text-white">Amount (USD)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <Input
                    type="number"
                    min="1"
                    max="1000"
                    value={topUpAmount}
                    onChange={(e) => setTopUpAmount(e.target.value)}
                    className="bg-gray-800/50 border-white/10 text-white pl-7"
                    placeholder="10.00"
                  />
                </div>
                <p className="text-xs text-gray-400">Minimum: $1.00, Maximum: $1,000.00</p>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[10, 25, 50, 100].map(amount => (
                  <Button
                    key={amount}
                    variant="outline"
                    size="sm"
                    onClick={() => setTopUpAmount(amount.toString())}
                    className="border-white/10 text-white hover:bg-white/5"
                  >
                    ${amount}
                  </Button>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={handleTopUp}
                disabled={processingTopUp}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500"
              >
                {processingTopUp ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CreditCard className="mr-2 h-4 w-4" />
                    Proceed to Payment
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Credit Exhaustion Modal */}
        <AlertDialog open={showCreditExhaustionModal} onOpenChange={setShowCreditExhaustionModal}>
          <AlertDialogContent className="bg-gray-900 border-red-500/20 z-[80]">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Credits Exhausted
              </AlertDialogTitle>
              <AlertDialogDescription className="text-gray-300">
                You have run out of credits and cannot send messages. Purchase more credits to continue using PiPilot.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
              <div className="bg-red-950/20 border border-red-500/20 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-red-400" />
                    <span className="text-red-300 font-medium">Current Balance</span>
                  </div>
                  <span className="text-red-400 font-bold">{creditBalance?.toFixed(2) || '0.00'} credits</span>
                </div>
                <p className="text-xs text-red-300/70 mt-2">
                  You need credits to send messages and use PiPilot's AI features.
                </p>
              </div>
            </div>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel className="bg-gray-700 text-gray-300 hover:bg-gray-600 border-gray-600">
                Cancel
              </AlertDialogCancel>
              {(() => {
                const planConfig = PRODUCT_CONFIGS[currentPlan]
                const canPurchase = planConfig ? planConfig.limits.canPurchaseCredits : false
                return canPurchase ? (
                  <Button
                    onClick={() => {
                      setShowCreditExhaustionModal(false)
                      setShowTopUpDialog(true)
                    }}
                    className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500"
                  >
                    <CreditCard className="mr-2 h-4 w-4" />
                    Buy Credits
                  </Button>
                ) : (
                  <Button
                    onClick={() => window.location.href = '/pricing'}
                    className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500"
                  >
                    <Zap className="mr-2 h-4 w-4" />
                    Upgrade Plan
                  </Button>
                )
              })()}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Slash Commands Popup */}
        <SlashCommands
          isOpen={slashCommands.isOpen}
          onClose={slashCommands.close}
          onSelect={handleSlashCommandSelect}
          query={slashCommands.query}
          position={slashCommands.position}
          commands={slashCommandHandlers}
        />

        {/* Voice Input Panel */}
        <VoiceInputPanel
          isOpen={showVoicePanel}
          onClose={() => setShowVoicePanel(false)}
          onTranscriptComplete={handleVoiceTranscript}
        />

        {/* Visual Diff Preview Dialog */}
        <VisualDiffPreview
          open={showDiffPreview}
          onOpenChange={setShowDiffPreview}
          fileChanges={pendingFileChanges}
          onApprove={(changes) => {
            // Apply the changes
            setPendingFileChanges([])
            setShowDiffPreview(false)
            toast({ title: 'Changes Applied', description: `Applied ${changes.length} file(s)` })
          }}
          onReject={() => {
            setPendingFileChanges([])
            setShowDiffPreview(false)
          }}
        />

        {/* Branch Creation Dialog */}
        <CreateBranchDialog
          open={showBranchDialog}
          onOpenChange={setShowBranchDialog}
          messagePreview={branchingMessagePreview}
          onCreateBranch={(name, description) => {
            if (branchingMessageId) {
              handleCreateBranch(branchingMessageId, name, description)
              setBranchingMessageId(null)
            }
          }}
        />

        {/* Memory Context Dialog */}
        <Dialog open={showMemoryDialog} onOpenChange={setShowMemoryDialog}>
          <DialogContent className="sm:max-w-lg z-[100]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                AI Memory & Context
              </DialogTitle>
              <DialogDescription>
                View what AI remembers about this project and conversation.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <MemoryContextDisplay
                workspaceId={project?.id || null}
                userId={project?.userId || ''}
              />
              <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground">
                  <strong>Current Session:</strong> {currentChatSessionId?.slice(0, 12) || 'None'}...
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  <strong>Messages in this chat:</strong> {messages.length}
                </p>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Codebase Search Dialog */}
        <CodebaseSearch
          open={showSearchDialog}
          onOpenChange={setShowSearchDialog}
          projectId={project?.id || null}
          onOpenFile={handleOpenFileFromSearch}
          onAttachContext={handleAttachSearchContext}
          attachedContexts={attachedSearchContexts}
          onRemoveContext={handleRemoveSearchContext}
        />

        {/* Stream Recovery - Auto-recovers on mount, no dialog needed */}
      </div>
    </div>
  )
}