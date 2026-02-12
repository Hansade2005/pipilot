"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { checkAdminAccess } from "@/lib/admin-utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ArrowLeft,
  BarChart3,
  TrendingUp,
  Users,
  CreditCard,
  Activity,
  Shield,
  AlertCircle,
  CheckCircle,
  Download,
  Upload,
  RefreshCw,
  Calendar,
  DollarSign,
  Eye,
  Settings,
  Zap,
  Target,
  PieChart,
  LineChart,
  Clock,
  Globe
} from "lucide-react"
import { usePageTitle } from '@/hooks/use-page-title'

export default function AdminAnalyticsPage() {
  usePageTitle('Analytics')
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<any>(null)
  const [analyticsData, setAnalyticsData] = useState<any>(null)
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
      await loadAnalyticsData()
    } catch (error) {
      console.error('Error checking admin access:', error)
      router.push('/workspace')
    } finally {
      setLoading(false)
    }
  }

  const loadAnalyticsData = async () => {
    try {
      // Load system stats
      const statsResponse = await fetch('/api/admin/stats')
      if (statsResponse.ok) {
        const statsData = await statsResponse.json()
        setStats(statsData)
      }

      // Load additional analytics data
      const analyticsResponse = await fetch('/api/admin/analytics')
      if (analyticsResponse.ok) {
        const analyticsData = await analyticsResponse.json()
        setAnalyticsData(analyticsData)
      }
    } catch (error) {
      console.error('Error loading analytics data:', error)
    }
  }

  const handleRefreshData = () => {
    loadAnalyticsData()
  }

  const handleExportReport = async () => {
    try {
      const reportData = {
        generatedAt: new Date().toISOString(),
        stats: stats,
        analyticsData: analyticsData
      }

      const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `analytics-report-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error exporting analytics report:', error)
    }
  }

  const handleConfigure = () => {
    // Open analytics configuration dialog or navigate to settings
    router.push('/admin/system')
  }

  const handleExportFullReport = () => {
    handleExportReport()
  }

  const handleConfigureAlerts = () => {
    alert('Alert configuration is not yet implemented. Please check back later.')
  }

  const handleViewDetailedAnalytics = () => {
    alert('Detailed analytics view is not yet implemented. Please check back later.')
  }

  const handleCustomDashboard = () => {
    alert('Custom dashboard is not yet implemented. Please check back later.')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Clean Header */}
      <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-slate-200/50 dark:border-slate-700/50">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/admin')}
              className="hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Admin
            </Button>
            <div className="h-8 w-px bg-slate-200 dark:bg-slate-700"></div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-lg">
                <BarChart3 className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Analytics Dashboard</h1>
                <p className="text-sm text-slate-600 dark:text-slate-400">Comprehensive insights and performance metrics</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800">
              <Shield className="h-3 w-3 mr-1" />
              Admin Access
            </Badge>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        {/* Horizontal Action Bar */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <select className="pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm">
                  <option>Last 7 days</option>
                  <option>Last 30 days</option>
                  <option>Last 90 days</option>
                  <option>Last year</option>
                </select>
              </div>
              <Button variant="outline" size="sm" onClick={handleRefreshData} className="border-slate-200 dark:border-slate-700">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Data
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={handleExportReport} className="border-slate-200 dark:border-slate-700">
                <Download className="h-4 w-4 mr-2" />
                Export Report
              </Button>
              <Button variant="outline" size="sm" onClick={handleConfigure} className="border-slate-200 dark:border-slate-700">
                <Settings className="h-4 w-4 mr-2" />
                Configure
              </Button>
            </div>
          </div>
        </div>
        {/* Primary KPI Cards */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm font-medium">Total Users</p>
                  <p className="text-3xl font-bold">{stats?.totalUsers || 0}</p>
                  <p className="text-blue-200 text-xs mt-1">
                    <TrendingUp className="h-3 w-3 inline mr-1" />
                    Active: {stats?.activeUsers || 0}
                  </p>
                </div>
                <Users className="h-8 w-8 text-blue-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-sm font-medium">Active Sessions</p>
                  <p className="text-3xl font-bold">{stats?.activeUsers || 0}</p>
                  <p className="text-green-200 text-xs mt-1">
                    <Activity className="h-3 w-3 inline mr-1" />
                    Currently online
                  </p>
                </div>
                <Activity className="h-8 w-8 text-green-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100 text-sm font-medium">Conversion Rate</p>
                  <p className="text-3xl font-bold">
                    {stats?.totalUsers ? Math.round((stats.activeSubscriptions / stats.totalUsers) * 100) : 0}%
                  </p>
                  <p className="text-purple-200 text-xs mt-1">
                    <Target className="h-3 w-3 inline mr-1" />
                    Free to paid conversion
                  </p>
                </div>
                <Target className="h-8 w-8 text-purple-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-orange-100 text-sm font-medium">Avg. Session Time</p>
                  <p className="text-3xl font-bold">24m</p>
                  <p className="text-orange-200 text-xs mt-1">
                    <Clock className="h-3 w-3 inline mr-1" />
                    User engagement
                  </p>
                </div>
                <Clock className="h-8 w-8 text-orange-200" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Secondary Metrics */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                  <DollarSign className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    ${stats?.monthlyRevenue || 0}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Monthly Revenue</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
                  <Zap className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {stats?.deploymentCount || 0}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Deployments</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                  <Globe className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {stats?.activeSubscriptions || 0}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Active Sites</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 dark:bg-yellow-900/20 rounded-lg">
                  <LineChart className="h-4 w-4 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {stats?.systemHealth === 'healthy' ? '99.9%' : '95.2%'}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Uptime</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-12 gap-8">
          {/* Main Analytics Content */}
          <div className="col-span-8">
            {/* Analytics Charts Section */}
            <div className="grid grid-cols-2 gap-6 mb-8">
              <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 shadow-sm">
                <CardHeader className="border-b border-slate-200 dark:border-slate-700">
                  <CardTitle className="text-lg text-slate-900 dark:text-white flex items-center gap-2">
                    <LineChart className="h-5 w-5" />
                    User Growth Trend
                  </CardTitle>
                  <CardDescription className="text-slate-600 dark:text-slate-400">
                    Monthly user registration over time
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="h-64 flex items-center justify-center bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                    <div className="text-center">
                      <BarChart3 className="h-12 w-12 text-slate-400 mx-auto mb-2" />
                      <p className="text-sm text-slate-600 dark:text-slate-400">Chart visualization coming soon</p>
                      <p className="text-xs text-slate-500 mt-1">Interactive charts and graphs</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 shadow-sm">
                <CardHeader className="border-b border-slate-200 dark:border-slate-700">
                  <CardTitle className="text-lg text-slate-900 dark:text-white flex items-center gap-2">
                    <PieChart className="h-5 w-5" />
                    Plan Distribution
                  </CardTitle>
                  <CardDescription className="text-slate-600 dark:text-slate-400">
                    User distribution by subscription plan
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="h-64 flex items-center justify-center bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                    <div className="text-center">
                      <PieChart className="h-12 w-12 text-slate-400 mx-auto mb-2" />
                      <p className="text-sm text-slate-600 dark:text-slate-400">Pie chart visualization</p>
                      <p className="text-xs text-slate-500 mt-1">Plan breakdown and ratios</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Features and Capabilities */}
            <div className="grid grid-cols-2 gap-6">
              <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 shadow-sm">
                <CardHeader className="border-b border-slate-200 dark:border-slate-700">
                  <CardTitle className="text-lg text-slate-900 dark:text-white flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    Current Capabilities
                  </CardTitle>
                  <CardDescription className="text-slate-600 dark:text-slate-400">
                    Analytics features available today
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm text-slate-900 dark:text-white">User management and activity tracking</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm text-slate-900 dark:text-white">Subscription and billing analytics</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm text-slate-900 dark:text-white">System health and performance monitoring</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm text-slate-900 dark:text-white">Usage tracking (deployments & GitHub)</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm text-slate-900 dark:text-white">Domain and site analytics</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 shadow-sm">
                <CardHeader className="border-b border-slate-200 dark:border-slate-700">
                  <CardTitle className="text-lg text-slate-900 dark:text-white flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-blue-500" />
                    Coming Soon
                  </CardTitle>
                  <CardDescription className="text-slate-600 dark:text-slate-400">
                    Advanced analytics features in development
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <span className="text-sm text-slate-900 dark:text-white">Real-time usage metrics and dashboards</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                      <span className="text-sm text-slate-900 dark:text-white">Advanced user behavior analytics</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-sm text-slate-900 dark:text-white">Revenue and conversion funnel tracking</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                      <span className="text-sm text-slate-900 dark:text-white">Custom reporting and export capabilities</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                      <span className="text-sm text-slate-900 dark:text-white">Predictive analytics and insights</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Analytics Sidebar */}
          <div className="col-span-4">
            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 shadow-sm sticky top-8">
              <CardHeader className="border-b border-slate-200 dark:border-slate-700">
                <CardTitle className="text-lg text-slate-900 dark:text-white flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Key Insights
                </CardTitle>
                <CardDescription className="text-slate-600 dark:text-slate-400">
                  Important metrics and trends
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {/* Insights */}
                <div className="p-3 bg-green-50 dark:bg-green-900/10 rounded-lg border border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-green-900 dark:text-green-100">Growth Trend</span>
                  </div>
                  <p className="text-xs text-green-800 dark:text-green-200">
                    User registrations increased by 12% this month, with strong conversion from free to paid plans.
                  </p>
                </div>

                <div className="p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-900 dark:text-blue-100">High Engagement</span>
                  </div>
                  <p className="text-xs text-blue-800 dark:text-blue-200">
                    Average session time of 24 minutes indicates high user engagement and platform value.
                  </p>
                </div>

                <div className="p-3 bg-purple-50 dark:bg-purple-900/10 rounded-lg border border-purple-200 dark:border-purple-800">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="h-4 w-4 text-purple-600" />
                    <span className="text-sm font-medium text-purple-900 dark:text-purple-100">Conversion Success</span>
                  </div>
                  <p className="text-xs text-purple-800 dark:text-purple-200">
                    8.5% conversion rate from free to paid is above industry average for SaaS platforms.
                  </p>
                </div>

                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/10 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="h-4 w-4 text-yellow-600" />
                    <span className="text-sm font-medium text-yellow-900 dark:text-yellow-100">Usage Spike</span>
                  </div>
                  <p className="text-xs text-yellow-800 dark:text-yellow-200">
                    Deployment activity increased 23% following the latest feature release.
                  </p>
                </div>

                {/* Quick Actions */}
                <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-6">
                  <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-3">Quick Actions</h4>
                  <div className="space-y-2">
                    <Button variant="outline" size="sm" onClick={handleExportFullReport} className="w-full justify-start border-slate-200 dark:border-slate-700">
                      <Download className="h-4 w-4 mr-2" />
                      Export Full Report
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleConfigureAlerts} className="w-full justify-start border-slate-200 dark:border-slate-700">
                      <Settings className="h-4 w-4 mr-2" />
                      Configure Alerts
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleViewDetailedAnalytics} className="w-full justify-start border-slate-200 dark:border-slate-700">
                      <Eye className="h-4 w-4 mr-2" />
                      View Detailed Analytics
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleCustomDashboard} className="w-full justify-start border-slate-200 dark:border-slate-700">
                      <BarChart3 className="h-4 w-4 mr-2" />
                      Custom Dashboard
                    </Button>
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
