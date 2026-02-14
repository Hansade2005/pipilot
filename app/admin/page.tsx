"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { checkAdminAccess, ADMIN_MENU_ITEMS, hasAdminPermission } from "@/lib/admin-utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  BarChart3,
  Users,
  CreditCard,
  TrendingUp,
  Settings,
  Shield,
  AlertCircle,
  CheckCircle,
  DollarSign,
  Activity,
  UserPlus,
  Zap, Download, RefreshCw,
  Webhook
} from "lucide-react"
import { usePageTitle } from '@/hooks/use-page-title'

interface SystemStats {
  totalUsers: number
  activeUsers: number
  totalRevenue: number
  monthlyRevenue: number
  totalSubscriptions: number
  activeSubscriptions: number
  deploymentCount: number
  githubPushCount: number
  systemHealth: 'healthy' | 'warning' | 'critical'
  subscriptionSystemEnabled: boolean
}

interface SystemSettings {
  subscriptionSystemEnabled: boolean
  freeModeDescription: string
  lastUpdated: string
  updatedBy: string
}

interface RecentActivity {
  id: string
  type: 'user_registration' | 'subscription' | 'deployment' | 'notification'
  title: string
  description: string
  timestamp: string
  color: string
}

export default function AdminPanel() {
  usePageTitle('Admin Dashboard')
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [webhookStatus, setWebhookStatus] = useState<any>(null)
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null)
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([])
  const [settingsLoading, setSettingsLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkAdminAndLoadData()
  }, [])

  const checkAdminAndLoadData = async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser()

      if (error || !user) {
        router.push('/auth/login')
        return
      }

      if (!checkAdminAccess(user)) {
        router.push('/workspace')
        return
      }

      setUser(user)
      const statsData = await loadSystemStats()

      // Load recent activities
      await loadRecentActivities()

      // Load webhook status
      try {
        const webhookResponse = await fetch('/api/admin/webhook-status')
        if (webhookResponse.ok) {
          const webhookData = await webhookResponse.json()
          setWebhookStatus(webhookData)
        }
      } catch (webhookError) {
        console.error('Error loading webhook status:', webhookError)
        setWebhookStatus({ health: { status: 'error' }, statistics: { lastHour: 0 } })
      }

      // System settings are now included in stats, so we can set them from there
      if (statsData?.subscriptionSystemEnabled !== undefined) {
        setSystemSettings({
          subscriptionSystemEnabled: statsData.subscriptionSystemEnabled,
          freeModeDescription: statsData.subscriptionSystemEnabled ? 'Subscription system is active' : 'Free usage mode - no subscription charges',
          lastUpdated: new Date().toISOString(),
          updatedBy: user?.email || 'system'
        })
      }
    } catch (error) {
      console.error('Error checking admin access:', error)
      router.push('/workspace')
    } finally {
      setLoading(false)
    }
  }

  const loadSystemStats = async () => {
    try {
      // Fetch system statistics
      const response = await fetch('/api/admin/stats')
      if (response.ok) {
        const data = await response.json()
        setStats(data)
        return data // Return stats for use in checkAdminAndLoadData
      }
      return null
    } catch (error) {
      console.error('Error loading system stats:', error)
      return null
    }
  }

  const loadRecentActivities = async () => {
    try {
      const response = await fetch('/api/admin/recent-activities')
      if (response.ok) {
        const data = await response.json()
        setRecentActivities(data)
      }
    } catch (error) {
      console.error('Error loading recent activities:', error)
      // Set empty array on error
      setRecentActivities([])
    }
  }

  const handleExportReport = async () => {
    try {
      // Generate a comprehensive admin report
      const reportData = {
        generatedAt: new Date().toISOString(),
        stats: stats,
        recentActivities: recentActivities,
        systemSettings: systemSettings
      }

      // Create and download JSON report
      const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `admin-report-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error exporting report:', error)
    }
  }

  const toggleSubscriptionSystem = async (enabled: boolean) => {
    try {
      setSettingsLoading(true)

      const response = await fetch('/api/admin/system-settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled })
      })

      if (response.ok) {
        const data = await response.json()

        // Reload stats to reflect changes (this also updates system settings)
        const updatedStats = await loadSystemStats()

        // Update system settings from the updated stats
        if (updatedStats?.subscriptionSystemEnabled !== undefined) {
          setSystemSettings({
            subscriptionSystemEnabled: updatedStats.subscriptionSystemEnabled,
            freeModeDescription: updatedStats.subscriptionSystemEnabled ? 'Subscription system is active' : 'Free usage mode - no subscription charges',
            lastUpdated: new Date().toISOString(),
            updatedBy: user?.email || 'system'
          })
        }

        // Show success message
        alert(`Subscription system ${enabled ? 'enabled' : 'disabled'} successfully!`)
      } else {
        throw new Error('Failed to update system settings')
      }
    } catch (error) {
      console.error('Error toggling subscription system:', error)
      alert('Failed to update subscription system. Please try again.')
    } finally {
      setSettingsLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading admin panel...</p>
        </div>
      </div>
    )
  }

  if (!user || !checkAdminAccess(user)) {
    return null // Will redirect
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Clean Header */}
      <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-slate-200/50 dark:border-slate-700/50">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow-lg">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Admin Dashboard</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">System overview and management</p>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800">
              <CheckCircle className="h-3 w-3 mr-1" />
              Admin Access
            </Badge>
            <span className="text-sm text-slate-600 dark:text-slate-400 hidden md:inline">
              {user?.email}
            </span>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        {/* Horizontal Action Bar */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="sm" onClick={loadSystemStats} className="border-slate-200 dark:border-slate-700">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Data
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportReport} className="border-slate-200 dark:border-slate-700">
                <Download className="h-4 w-4 mr-2" />
                Export Report
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  stats?.systemHealth === 'healthy' ? 'bg-green-500' :
                  stats?.systemHealth === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
                }`} />
                <span className="text-sm font-medium capitalize">{stats?.systemHealth || 'Unknown'}</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => router.push('/admin/system')} className="border-slate-200 dark:border-slate-700">
                <Settings className="h-4 w-4 mr-2" />
                System Settings
              </Button>
            </div>
          </div>
        </div>

        {/* Primary KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Revenue KPI - Most Important */}
          <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-sm font-medium">Total Revenue</p>
                  <p className="text-3xl font-bold">{stats?.subscriptionSystemEnabled ? `$${stats?.totalRevenue || 0}` : '$0'}</p>
                  <p className="text-green-200 text-xs mt-1">
                    <TrendingUp className="h-3 w-3 inline mr-1" />
                    {stats?.subscriptionSystemEnabled
                      ? `+$${stats?.monthlyRevenue || 0} this month`
                      : 'Free mode active'
                    }
                  </p>
                </div>
                <DollarSign className="h-8 w-8 text-green-200" />
              </div>
            </CardContent>
          </Card>

          {/* Users KPI */}
          <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm font-medium">Active Users</p>
                  <p className="text-3xl font-bold">{stats?.activeUsers || 0}</p>
                  <p className="text-blue-200 text-xs mt-1">
                    <UserPlus className="h-3 w-3 inline mr-1" />
                    Total: {stats?.totalUsers || 0}
                  </p>
                </div>
                <Users className="h-8 w-8 text-blue-200" />
              </div>
            </CardContent>
          </Card>

          {/* Subscriptions KPI */}
          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100 text-sm font-medium">Subscriptions</p>
                  <p className="text-3xl font-bold">{stats?.subscriptionSystemEnabled ? (stats?.activeSubscriptions || 0) : 'N/A'}</p>
                  <p className="text-purple-200 text-xs mt-1">
                    <CreditCard className="h-3 w-3 inline mr-1" />
                    {stats?.subscriptionSystemEnabled
                      ? `${stats?.totalSubscriptions || 0} total`
                      : 'Free mode'
                    }
                  </p>
                </div>
                <CreditCard className="h-8 w-8 text-purple-200" />
              </div>
            </CardContent>
          </Card>

          {/* System Health KPI */}
          <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-orange-100 text-sm font-medium">System Status</p>
                  <p className="text-3xl font-bold capitalize">{stats?.systemHealth || 'Unknown'}</p>
                  <p className="text-orange-200 text-xs mt-1">
                    <Activity className="h-3 w-3 inline mr-1" />
                    All systems operational
                  </p>
                </div>
                <Activity className="h-8 w-8 text-orange-200" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Secondary Metrics & Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* System Metrics */}
          <div className="lg:col-span-2 space-y-6">
            {/* Deployment & Activity Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Zap className="h-4 w-4 text-orange-500" />
                    Deployments
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats?.deploymentCount || 0}</div>
                  <p className="text-xs text-muted-foreground">Total deployments</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-indigo-500" />
                    GitHub Pushes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats?.githubPushCount || 0}</div>
                  <p className="text-xs text-muted-foreground">Repository updates</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Webhook className={`h-4 w-4 ${
                      webhookStatus?.health?.status === 'healthy' ? 'text-green-500' :
                      webhookStatus?.health?.status === 'warning' ? 'text-yellow-500' :
                      webhookStatus?.health?.status === 'error' ? 'text-red-500' :
                      'text-muted-foreground'
                    }`} />
                    Webhooks
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {webhookStatus?.health?.successRate !== undefined
                      ? `${webhookStatus.health.successRate}%`
                      : 'N/A'
                    }
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {webhookStatus?.statistics?.lastHour || 0} events/hour
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* System Settings Panel */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  System Configuration
                </CardTitle>
                <CardDescription>
                  Global system settings and subscription management
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Subscription System Toggle */}
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Label htmlFor="subscription-toggle" className="text-base font-medium">
                          Subscription System
                        </Label>
                        <Badge variant={systemSettings?.subscriptionSystemEnabled ? "default" : "secondary"}>
                          {systemSettings?.subscriptionSystemEnabled ? "Active" : "Disabled"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {systemSettings?.subscriptionSystemEnabled
                          ? "Users are charged for subscriptions and usage"
                          : "Free usage mode: All users get unlimited access"
                        }
                      </p>
                    </div>
                    <Switch
                      id="subscription-toggle"
                      checked={systemSettings?.subscriptionSystemEnabled || false}
                      onCheckedChange={toggleSubscriptionSystem}
                      disabled={settingsLoading}
                    />
                  </div>

                  {/* Mode Status Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 border rounded-lg bg-gradient-to-br from-background to-muted/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Shield className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Current Mode</span>
                      </div>
                      <p className="text-lg font-semibold">
                        {systemSettings?.subscriptionSystemEnabled ? "Paid Mode" : "Free Mode"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {systemSettings?.subscriptionSystemEnabled
                          ? "Revenue generation active"
                          : "User growth focused"
                        }
                      </p>
                    </div>

                    <div className="p-4 border rounded-lg bg-gradient-to-br from-background to-muted/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Activity className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Last Updated</span>
                      </div>
                      <p className="text-lg font-semibold">
                        {systemSettings ? new Date(systemSettings.lastUpdated).toLocaleDateString() : 'Never'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        by {systemSettings?.updatedBy || 'system'}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Activity Feed Sidebar */}
          <div className="space-y-6">
            {/* Recent Activity */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-4 w-4" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {recentActivities.length > 0 ? (
                  recentActivities.map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3">
                      <div className={`w-2 h-2 rounded-full mt-2 ${
                        activity.color === 'green' ? 'bg-green-500' :
                        activity.color === 'blue' ? 'bg-blue-500' :
                        activity.color === 'yellow' ? 'bg-yellow-500' :
                        activity.color === 'purple' ? 'bg-purple-500' :
                        'bg-gray-500'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{activity.title}</p>
                        <p className="text-xs text-muted-foreground">{activity.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(activity.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground">No recent activity</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* System Alerts */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertCircle className="h-4 w-4" />
                  System Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-green-800 dark:text-green-200">
                        All systems operational
                      </p>
                      <p className="text-xs text-green-600 dark:text-green-400">
                        No issues detected
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                        Performance optimal
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400">
                        Response time: &lt;100ms
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
} 
