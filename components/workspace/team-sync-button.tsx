"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  RefreshCw,
  Check,
  AlertTriangle,
  FileText,
  Trash2,
  X,
  Upload,
  GitCommit,
  ArrowDown,
} from "lucide-react"
import { toast } from "sonner"

interface TeamSyncButtonProps {
  changedFiles: Set<string>
  deletedFiles: Set<string>
  pendingCount: number
  isSyncing: boolean
  lastSyncAt: string | null
  syncError: string | null
  isGitHubBacked?: boolean
  hasRemoteChanges?: boolean
  compact?: boolean
  onSync: () => Promise<{ success: boolean; synced?: number; deleted?: number; error?: string; blockedFiles?: string[] }>
  onClearPending: () => void
  onOpenSourceControl?: () => void
}

export function TeamSyncButton({
  changedFiles,
  deletedFiles,
  pendingCount,
  isSyncing,
  lastSyncAt,
  syncError,
  isGitHubBacked,
  hasRemoteChanges,
  compact = false,
  onSync,
  onClearPending,
  onOpenSourceControl,
}: TeamSyncButtonProps) {
  const [showDetails, setShowDetails] = useState(false)

  if (pendingCount === 0 && !syncError && !hasRemoteChanges) return null

  const handleClick = async () => {
    if (isGitHubBacked && onOpenSourceControl) {
      // For GitHub-backed workspaces, open the source control tab
      onOpenSourceControl()
      return
    }

    // Legacy: direct sync
    const result = await onSync()
    if (result.success) {
      toast.success(`Synced ${result.synced || 0} file${(result.synced || 0) !== 1 ? 's' : ''} to team`)
      setShowDetails(false)
    } else if (result.blockedFiles) {
      toast.error(`${result.blockedFiles.length} file(s) locked by another user`)
    } else {
      toast.error(result.error || 'Sync failed')
    }
  }

  const formatPath = (path: string) => {
    const parts = path.split('/')
    return parts.length > 2
      ? `.../${parts.slice(-2).join('/')}`
      : path
  }

  return (
    <Popover open={showDetails} onOpenChange={setShowDetails}>
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              onClick={handleClick}
              disabled={isSyncing}
              className={`${compact ? 'h-5 gap-1 text-[10px]' : 'h-7 gap-1.5 text-xs'} font-medium transition-all rounded-r-none ${
                syncError
                  ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/30'
                  : hasRemoteChanges
                    ? 'bg-orange-600/80 hover:bg-orange-500 text-white shadow-sm shadow-orange-500/20'
                    : 'bg-orange-600 hover:bg-orange-500 text-white shadow-sm shadow-orange-500/20'
              }`}
            >
              {isSyncing ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : syncError ? (
                <AlertTriangle className="h-3 w-3" />
              ) : isGitHubBacked ? (
                <GitCommit className="h-3 w-3" />
              ) : (
                <Upload className="h-3 w-3" />
              )}
              <span>
                {isSyncing
                  ? 'Syncing...'
                  : syncError
                    ? 'Error'
                    : hasRemoteChanges
                      ? 'Pull available'
                      : isGitHubBacked
                        ? `${pendingCount} changes`
                        : `Sync ${pendingCount}`
                }
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {isSyncing
              ? 'Syncing files...'
              : syncError
                ? syncError
                : isGitHubBacked
                  ? `${pendingCount} uncommitted change${pendingCount !== 1 ? 's' : ''}. Click to open source control.`
                  : `${pendingCount} file change${pendingCount !== 1 ? 's' : ''} ready to sync`
            }
          </TooltipContent>
        </Tooltip>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className={`${compact ? 'h-5 w-5' : 'h-7 w-6'} p-0 rounded-l-none bg-orange-700/50 hover:bg-orange-600/50 text-white/70 hover:text-white`}
            title="View pending changes"
          >
            <span className="text-[10px]">...</span>
          </Button>
        </PopoverTrigger>
      </div>
      <PopoverContent
        side="bottom"
        align="end"
        className="w-80 p-0 bg-gray-900 border-gray-800"
      >
        <div className="px-3 py-2.5 border-b border-gray-800/60 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-200">
            {isGitHubBacked ? 'Uncommitted Changes' : 'Pending Changes'} ({pendingCount})
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-gray-500 hover:text-gray-300 hover:bg-gray-800"
              onClick={() => {
                onClearPending()
                setShowDetails(false)
              }}
              title="Dismiss all"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <div className={pendingCount > 8 ? "max-h-[208px] overflow-y-auto" : ""}>
          <div className="p-1.5 space-y-0.5">
            {Array.from(changedFiles).map(path => (
              <div
                key={path}
                className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-gray-300"
              >
                <FileText className="h-3 w-3 text-orange-400 flex-shrink-0" />
                <span className="truncate flex-1" title={path}>
                  {formatPath(path)}
                </span>
                <span className="text-[10px] text-orange-400/70 flex-shrink-0">modified</span>
              </div>
            ))}
            {Array.from(deletedFiles).map(path => (
              <div
                key={path}
                className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-gray-400"
              >
                <Trash2 className="h-3 w-3 text-red-400 flex-shrink-0" />
                <span className="truncate flex-1 line-through" title={path}>
                  {formatPath(path)}
                </span>
                <span className="text-[10px] text-red-400/70 flex-shrink-0">deleted</span>
              </div>
            ))}
          </div>
        </div>

        {syncError && (
          <div className="px-3 py-2 border-t border-gray-800/60 bg-red-500/5">
            <div className="flex items-start gap-2 text-xs text-red-400">
              <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>{syncError}</span>
            </div>
          </div>
        )}

        <div className="px-3 py-2.5 border-t border-gray-800/60 flex items-center justify-between gap-2">
          {lastSyncAt && (
            <span className="text-[10px] text-gray-500 flex items-center gap-1">
              <Check className="h-2.5 w-2.5" />
              Last synced {new Date(lastSyncAt).toLocaleTimeString()}
            </span>
          )}
          <div className="flex-1" />
          <Button
            size="sm"
            onClick={handleClick}
            disabled={isSyncing || (pendingCount === 0 && !hasRemoteChanges)}
            className="h-7 text-xs bg-orange-600 hover:bg-orange-500 text-white"
          >
            {isSyncing ? (
              <>
                <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />
                Syncing...
              </>
            ) : isGitHubBacked ? (
              <>
                <GitCommit className="h-3 w-3 mr-1.5" />
                Open Source Control
              </>
            ) : (
              <>
                <Upload className="h-3 w-3 mr-1.5" />
                Sync All
              </>
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
