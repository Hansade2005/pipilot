"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Activity,
  Plus,
  Trash2,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Pause,
  Play,
  Globe,
  Zap,
  ArrowRight,
  Shield
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface Monitor {
  id: string
  user_id: string
  project_id: string | null
  name: string
  url: string
  check_interval_minutes: number
  is_active: boolean
  is_auto: boolean
  last_status: string
  last_checked_at: string | null
  last_response_time_ms: number | null
  last_status_code: number | null
  last_error: string | null
  consecutive_failures: number
  uptime_percentage: number
  total_checks: number
  total_failures: number
  created_at: string
}

interface Incident {
  id: string
  monitor_id: string
  project_id: string | null
  started_at: string
  resolved_at: string | null
  duration_seconds: number | null
  status: string
  error_message: string | null
  fix_prompt: string | null
  monitors?: { name: string; url: string }
}

interface MonitorTabProps {
  projectId?: string
  projectName?: string
  deploymentUrl?: string
  userId?: string
}

export function MonitorTab({ projectId, projectName, deploymentUrl, userId }: MonitorTabProps) {
  const [monitors, setMonitors] = useState<Monitor[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [newMonitorName, setNewMonitorName] = useState("")
  const [newMonitorUrl, setNewMonitorUrl] = useState("")
  const [isAdding, setIsAdding] = useState(false)
  const [selectedMonitor, setSelectedMonitor] = useState<Monitor | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const fetchMonitors = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (projectId) params.set('projectId', projectId)

      const response = await fetch(`/api/monitors?${params}`)
      if (response.ok) {
        const data = await response.json()
        setMonitors(data.monitors || [])
      }
    } catch (error) {
      console.error('Error fetching monitors:', error)
    }
  }, [projectId])

  const fetchIncidents = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (projectId) params.set('projectId', projectId)
      params.set('limit', '10')

      const response = await fetch(`/api/monitors/incidents?${params}`)
      if (response.ok) {
        const data = await response.json()
        setIncidents(data.incidents || [])
      }
    } catch (error) {
      console.error('Error fetching incidents:', error)
    }
  }, [projectId])

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      await Promise.all([fetchMonitors(), fetchIncidents()])
      setIsLoading(false)
    }
    loadData()

    // Refresh every 60 seconds
    const interval = setInterval(() => {
      fetchMonitors()
      fetchIncidents()
    }, 60000)

    return () => clearInterval(interval)
  }, [fetchMonitors, fetchIncidents])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await Promise.all([fetchMonitors(), fetchIncidents()])
    setIsRefreshing(false)
    toast.success("Refreshed")
  }

  const handleAddMonitor = async () => {
    if (!newMonitorName.trim() || !newMonitorUrl.trim()) return
    setIsAdding(true)

    try {
      const response = await fetch('/api/monitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newMonitorName.trim(),
          url: newMonitorUrl.trim(),
          projectId,
          isAuto: false,
        })
      })

      const data = await response.json()

      if (response.ok) {
        toast.success("Monitor added! First check will run within 2 minutes.")
        setShowAddDialog(false)
        setNewMonitorName("")
        setNewMonitorUrl("")
        await fetchMonitors()
      } else {
        toast.error(data.error || "Failed to add monitor")
      }
    } catch (error) {
      toast.error("Failed to add monitor")
    } finally {
      setIsAdding(false)
    }
  }

  const handleDeleteMonitor = async (monitorId: string) => {
    try {
      const response = await fetch(`/api/monitors?id=${monitorId}`, { method: 'DELETE' })
      if (response.ok) {
        toast.success("Monitor removed")
        setMonitors(prev => prev.filter(m => m.id !== monitorId))
        if (selectedMonitor?.id === monitorId) setSelectedMonitor(null)
      }
    } catch {
      toast.error("Failed to remove monitor")
    }
  }

  const handleToggleMonitor = async (monitor: Monitor) => {
    try {
      const response = await fetch('/api/monitors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: monitor.id, is_active: !monitor.is_active })
      })

      if (response.ok) {
        setMonitors(prev => prev.map(m =>
          m.id === monitor.id ? { ...m, is_active: !m.is_active } : m
        ))
        toast.success(monitor.is_active ? "Monitor paused" : "Monitor resumed")
      }
    } catch {
      toast.error("Failed to update monitor")
    }
  }

  const handleFixClick = (incident: Incident) => {
    if (incident.project_id && incident.fix_prompt) {
      // Store fix prompt and redirect to workspace
      sessionStorage.setItem(`initial-prompt-${incident.project_id}`, incident.fix_prompt)
      window.location.href = `/workspace?projectId=${incident.project_id}`
    }
  }

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'up':
        return { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Up', dot: 'bg-emerald-400' }
      case 'down':
        return { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Down', dot: 'bg-red-400' }
      case 'degraded':
        return { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10', label: 'Degraded', dot: 'bg-yellow-400' }
      case 'timeout':
        return { icon: Clock, color: 'text-orange-400', bg: 'bg-orange-500/10', label: 'Timeout', dot: 'bg-orange-400' }
      case 'error':
        return { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Error', dot: 'bg-red-400' }
      default:
        return { icon: Clock, color: 'text-gray-400', bg: 'bg-gray-500/10', label: 'Pending', dot: 'bg-gray-400' }
    }
  }

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return 'Never'
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    return `${Math.floor(diffHours / 24)}d ago`
  }

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-'
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  }

  // Calculate overall stats
  const activeMonitors = monitors.filter(m => m.is_active)
  const upMonitors = monitors.filter(m => m.last_status === 'up')
  const downMonitors = monitors.filter(m => ['down', 'timeout', 'error'].includes(m.last_status))
  const avgUptime = monitors.length > 0
    ? (monitors.reduce((sum, m) => sum + (m.uptime_percentage || 100), 0) / monitors.length).toFixed(1)
    : '100.0'
  const ongoingIncidents = incidents.filter(i => i.status === 'ongoing')

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading monitors...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-950">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800/60 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-orange-600/15 flex items-center justify-center">
              <Activity className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">AppCare</h2>
              <p className="text-[11px] text-gray-500">Monitor your deployed apps</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="h-7 w-7 p-0 text-gray-400 hover:text-orange-400 hover:bg-orange-500/10"
                >
                  <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
            <Button
              size="sm"
              onClick={() => {
                setNewMonitorUrl(deploymentUrl || '')
                setNewMonitorName(projectName || '')
                setShowAddDialog(true)
              }}
              className="h-7 bg-orange-600 hover:bg-orange-500 text-white text-xs px-2.5"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add Monitor
            </Button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Stats Overview */}
        <div className="grid grid-cols-4 gap-2">
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-3 text-center">
            <div className="text-lg font-bold text-white">{monitors.length}</div>
            <div className="text-[11px] text-gray-500">Monitors</div>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-3 text-center">
            <div className={cn("text-lg font-bold", downMonitors.length > 0 ? "text-red-400" : "text-emerald-400")}>
              {upMonitors.length}/{activeMonitors.length}
            </div>
            <div className="text-[11px] text-gray-500">Up</div>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-3 text-center">
            <div className={cn("text-lg font-bold", parseFloat(avgUptime) < 99 ? "text-yellow-400" : "text-emerald-400")}>
              {avgUptime}%
            </div>
            <div className="text-[11px] text-gray-500">Uptime</div>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-3 text-center">
            <div className={cn("text-lg font-bold", ongoingIncidents.length > 0 ? "text-red-400" : "text-gray-400")}>
              {ongoingIncidents.length}
            </div>
            <div className="text-[11px] text-gray-500">Incidents</div>
          </div>
        </div>

        {/* Empty State */}
        {monitors.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-700 bg-gray-900/30 p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-orange-600/15 flex items-center justify-center mx-auto mb-4">
              <Shield className="w-6 h-6 text-orange-400" />
            </div>
            <h3 className="text-sm font-semibold text-white mb-2">No monitors yet</h3>
            <p className="text-xs text-gray-500 mb-4 max-w-sm mx-auto">
              Add a monitor to track your deployed app's uptime, response time, and get alerts when things go down.
            </p>
            <Button
              size="sm"
              onClick={() => {
                setNewMonitorUrl(deploymentUrl || '')
                setNewMonitorName(projectName || '')
                setShowAddDialog(true)
              }}
              className="bg-orange-600 hover:bg-orange-500 text-white text-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add Your First Monitor
            </Button>
          </div>
        )}

        {/* Monitor List */}
        {monitors.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 bg-orange-500 rounded-sm" />
              <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Monitors</h3>
            </div>
            {monitors.map((monitor) => {
              const statusConfig = getStatusConfig(monitor.last_status)
              const StatusIcon = statusConfig.icon
              return (
                <div
                  key={monitor.id}
                  className={cn(
                    "rounded-xl border bg-gray-900/50 p-3 transition-all duration-200 cursor-pointer",
                    selectedMonitor?.id === monitor.id
                      ? "border-orange-500/30 ring-1 ring-orange-500/20"
                      : "border-gray-800 hover:border-gray-700"
                  )}
                  onClick={() => setSelectedMonitor(selectedMonitor?.id === monitor.id ? null : monitor)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative flex-shrink-0">
                        <div className={cn("w-2.5 h-2.5 rounded-full", statusConfig.dot)} />
                        {monitor.last_status === 'up' && (
                          <div className={cn("absolute inset-0 w-2.5 h-2.5 rounded-full animate-ping opacity-30", statusConfig.dot)} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white truncate">{monitor.name}</span>
                          {!monitor.is_active && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">Paused</span>
                          )}
                          {monitor.is_auto && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400">Auto</span>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-500 truncate">{monitor.url}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                      <div className="text-right hidden sm:block">
                        <div className={cn("text-xs font-medium", statusConfig.color)}>
                          {statusConfig.label}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          {monitor.last_response_time_ms ? `${monitor.last_response_time_ms}ms` : '-'}
                        </div>
                      </div>
                      <div className="text-right hidden sm:block">
                        <div className="text-xs text-gray-300">{monitor.uptime_percentage}%</div>
                        <div className="text-[11px] text-gray-500">{formatTime(monitor.last_checked_at)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {selectedMonitor?.id === monitor.id && (
                    <div className="mt-3 pt-3 border-t border-gray-800/60 space-y-3">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="text-center">
                          <div className="text-xs font-medium text-gray-300">{monitor.total_checks}</div>
                          <div className="text-[10px] text-gray-500">Total Checks</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs font-medium text-gray-300">{monitor.total_failures}</div>
                          <div className="text-[10px] text-gray-500">Failures</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs font-medium text-gray-300">{monitor.check_interval_minutes}m</div>
                          <div className="text-[10px] text-gray-500">Interval</div>
                        </div>
                      </div>

                      {monitor.last_error && (
                        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
                          <div className="text-[11px] text-red-300 font-medium mb-0.5">Last Error</div>
                          <div className="text-[11px] text-red-400/80 break-all">{monitor.last_error}</div>
                        </div>
                      )}

                      <div className="flex items-center gap-1.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleToggleMonitor(monitor) }}
                              className="h-7 text-xs text-gray-400 hover:text-orange-400 hover:bg-orange-500/10"
                            >
                              {monitor.is_active ? <Pause className="w-3 h-3 mr-1" /> : <Play className="w-3 h-3 mr-1" />}
                              {monitor.is_active ? 'Pause' : 'Resume'}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{monitor.is_active ? 'Pause monitoring' : 'Resume monitoring'}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); window.open(monitor.url, '_blank') }}
                              className="h-7 text-xs text-gray-400 hover:text-orange-400 hover:bg-orange-500/10"
                            >
                              <ExternalLink className="w-3 h-3 mr-1" />
                              Visit
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Open URL</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleDeleteMonitor(monitor.id) }}
                              className="h-7 text-xs text-gray-400 hover:text-red-400 hover:bg-red-500/10 ml-auto"
                            >
                              <Trash2 className="w-3 h-3 mr-1" />
                              Remove
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete monitor</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Recent Incidents */}
        {incidents.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 bg-red-500 rounded-sm" />
              <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Recent Incidents</h3>
            </div>
            {incidents.map((incident) => {
              const isOngoing = incident.status === 'ongoing'
              return (
                <div
                  key={incident.id}
                  className={cn(
                    "rounded-xl border p-3",
                    isOngoing
                      ? "border-red-500/30 bg-red-500/5"
                      : "border-gray-800 bg-gray-900/50"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {isOngoing ? (
                          <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        )}
                        <span className="text-sm font-medium text-white truncate">
                          {(incident.monitors as any)?.name || 'Monitor'}
                        </span>
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded",
                          isOngoing ? "bg-red-500/20 text-red-400" : "bg-emerald-500/10 text-emerald-400"
                        )}>
                          {isOngoing ? 'Ongoing' : 'Resolved'}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-500 mt-1">
                        {incident.error_message || 'Service unavailable'}
                        {incident.duration_seconds && ` - Duration: ${formatDuration(incident.duration_seconds)}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      <span className="text-[11px] text-gray-500">
                        {formatTime(incident.started_at)}
                      </span>
                      {isOngoing && incident.fix_prompt && incident.project_id && (
                        <Button
                          size="sm"
                          onClick={() => handleFixClick(incident)}
                          className="h-6 text-[11px] bg-orange-600 hover:bg-orange-500 text-white px-2"
                        >
                          <Zap className="w-3 h-3 mr-1" />
                          Fix
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Pro tip */}
        {monitors.length > 0 && monitors.length < 3 && (
          <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3">
            <div className="flex items-start gap-2">
              <Zap className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-medium text-orange-300">Pro tip</div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  Deploy your app to get automatic monitoring. AppCare will ping your site and alert you instantly if it goes down.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add Monitor Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-[420px] bg-gray-950 border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Globe className="w-5 h-5 text-orange-400" />
              Add Monitor
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Enter the URL you want to monitor. We'll check it regularly and alert you if it goes down.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm text-gray-300">Name</Label>
              <Input
                placeholder="My App"
                value={newMonitorName}
                onChange={(e) => setNewMonitorName(e.target.value)}
                className="bg-gray-900 border-gray-700 text-white focus:ring-orange-500/50 focus:border-orange-500/50"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-gray-300">URL</Label>
              <Input
                placeholder="https://myapp.vercel.app"
                value={newMonitorUrl}
                onChange={(e) => setNewMonitorUrl(e.target.value)}
                className="bg-gray-900 border-gray-700 text-white focus:ring-orange-500/50 focus:border-orange-500/50"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowAddDialog(false)}
              className="text-gray-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddMonitor}
              disabled={!newMonitorName.trim() || !newMonitorUrl.trim() || isAdding}
              className="bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-30"
            >
              {isAdding ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add Monitor
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
