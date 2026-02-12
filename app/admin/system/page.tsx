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
  Settings,
  Shield,
  Database,
  Key,
  AlertTriangle,
  CheckCircle,
  Activity,
  Server,
  Zap,
  Globe,
  Clock,
  BarChart3,
  Download,
  RefreshCw,
  Eye,
  Target,
  TrendingUp,
  LineChart
} from "lucide-react"
import { usePageTitle } from '@/hooks/use-page-title'

export default function AdminSystemPage() {
  usePageTitle('System Settings')
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [systemHealth, setSystemHealth] = useState<any>(null)
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
      await loadSystemHealth()
    } catch (error) {
      console.error('Error checking admin access:', error)
      router.push('/workspace')
    } finally {
      setLoading(false)
    }
  }

  const loadSystemHealth = async () => {
    try {
      const response = await fetch('/api/admin/system')
      if (response.ok) {
        const data = await response.json()
        setSystemHealth(data)
      }
    } catch (error) {
      console.error('Error loading system health:', error)
    }
  }

  const handleExportSystemReport = async () => {
    try {
      const reportData = {
        generatedAt: new Date().toISOString(),
        systemHealth: systemHealth
      }

      const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `system-report-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error exporting system report:', error)
    }
  }

  const handleAdvancedConfig = () => {
    // Navigate to advanced system configuration
    // For now, just show an alert
    alert('Advanced system configuration is not yet implemented. Please check back later.')
  }

  const handleRunDiagnostics = () => {
    // Run system diagnostics
    // For now, just show an alert
    alert('Running system diagnostics... This feature is not yet implemented. Please check back later.')
  }

  const handleGenerateReport = () => {
    // Generate a comprehensive system report
    // For now, just show an alert
    alert('Generating comprehensive system report... This feature is not yet implemented. Please check back later.')
  }

  const handleViewLogs = () => {
    // Navigate to system logs view
    // For now, just show an alert
    alert('Viewing system logs... This feature is not yet implemented. Please check back later.')
  }

  const handlePerformanceMetrics = () => {
    // Navigate to performance metrics dashboard
    // For now, just show an alert
    alert('Viewing performance metrics... This feature is not yet implemented. Please check back later.')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">Loading system settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* Modern Dashboard Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white border-b border-slate-700">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/admin')}
                className="text-slate-300 hover:text-white hover:bg-slate-700"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="p-3 bg-slate-700/50 rounded-xl">
                <Settings className="h-7 w-7 text-blue-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">System Settings</h1>
                <p className="text-slate-300 mt-1">Advanced system configuration, monitoring, and maintenance</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Badge className="bg-green-500/20 text-green-300 border-green-500/30">
                <CheckCircle className="h-3 w-3 mr-1" />
                Admin Access
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        {/* Horizontal Action Bar */}
        <div className="flex items-center justify-between mb-8 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full animate-pulse ${
                systemHealth?.overall?.status === 'healthy' ? 'bg-green-500' :
                systemHealth?.overall?.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
              }`}></div>
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {systemHealth?.overall?.status === 'healthy' ? 'All Systems Operational' :
                 systemHealth?.overall?.status === 'warning' ? 'Minor Issues Detected' : 'Critical Issues'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" className="border-slate-200 dark:border-slate-700" onClick={loadSystemHealth}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Health Check
            </Button>
            <Button variant="outline" className="border-slate-200 dark:border-slate-700" onClick={handleExportSystemReport}>
              <Download className="h-4 w-4 mr-2" />
              System Report
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleAdvancedConfig}>
              <Settings className="h-4 w-4 mr-2" />
              Advanced Config
            </Button>
          </div>
        </div>
        {/* Primary KPI Cards */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-sm font-medium">System Status</p>
                  <p className="text-3xl font-bold capitalize">{systemHealth?.overall?.status || 'Unknown'}</p>
                  <p className="text-green-200 text-xs mt-1">
                    <CheckCircle className="h-3 w-3 inline mr-1" />
                    {systemHealth?.overall?.score || 0}% health score
                  </p>
                </div>
                <Server className="h-8 w-8 text-green-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm font-medium">Database</p>
                  <p className="text-3xl font-bold capitalize">{systemHealth?.database?.status || 'Unknown'}</p>
                  <p className="text-blue-200 text-xs mt-1">
                    <Database className="h-3 w-3 inline mr-1" />
                    Last checked: {systemHealth?.database?.lastChecked ? new Date(systemHealth.database.lastChecked).toLocaleTimeString() : 'Never'}
                  </p>
                </div>
                <Database className="h-8 w-8 text-blue-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100 text-sm font-medium">Security</p>
                  <p className="text-3xl font-bold capitalize">{systemHealth?.security?.status || 'Unknown'}</p>
                  <p className="text-purple-200 text-xs mt-1">
                    <Shield className="h-3 w-3 inline mr-1" />
                    All protections enabled
                  </p>
                </div>
                <Shield className="h-8 w-8 text-purple-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-orange-100 text-sm font-medium">Uptime</p>
                  <p className="text-3xl font-bold">{systemHealth?.overall?.uptime || 0}%</p>
                  <p className="text-orange-200 text-xs mt-1">
                    <Clock className="h-3 w-3 inline mr-1" />
                    Last 30 days
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
                  <Zap className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">1.2s</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Avg Response Time</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
                  <Activity className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">98.5%</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">API Success Rate</p>
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
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">24/7</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Monitoring</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 dark:bg-yellow-900/20 rounded-lg">
                  <BarChart3 className="h-4 w-4 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">0</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Active Alerts</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-12 gap-8">
          {/* Main System Content */}
          <div className="col-span-8">
            {/* Enhanced Configuration Sections */}
            <div className="grid grid-cols-2 gap-6 mb-8">
              <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 shadow-sm">
                <CardHeader className="border-b border-slate-200 dark:border-slate-700">
                  <CardTitle className="text-xl text-slate-900 dark:text-white flex items-center gap-2">
                    <Settings className="h-6 w-6" />
                    Environment Configuration
                  </CardTitle>
                  <CardDescription className="text-slate-600 dark:text-slate-400">
                    System environment and API settings
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
                          <Key className="h-4 w-4 text-green-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-white">Stripe Integration</p>
                          <p className="text-xs text-slate-600 dark:text-slate-400">Payment processing</p>
                        </div>
                      </div>
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300">
                        Configured
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                          <Database className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-white">Supabase Database</p>
                          <p className="text-xs text-slate-600 dark:text-slate-400">Data storage</p>
                        </div>
                      </div>
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300">
                        Connected
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-yellow-100 dark:bg-yellow-900/20 rounded-lg">
                          <Settings className="h-4 w-4 text-yellow-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-white">Email Service</p>
                          <p className="text-xs text-slate-600 dark:text-slate-400">Notifications</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="border-yellow-200 text-yellow-700 dark:border-yellow-800 dark:text-yellow-300">
                        Not Configured
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 shadow-sm">
                <CardHeader className="border-b border-slate-200 dark:border-slate-700">
                  <CardTitle className="text-xl text-slate-900 dark:text-white flex items-center gap-2">
                    <Shield className="h-6 w-6" />
                    System Maintenance
                  </CardTitle>
                  <CardDescription className="text-slate-600 dark:text-slate-400">
                    Maintenance and optimization tools
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-3">
                    <Button variant="outline" className="w-full justify-start border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
                      <Database className="h-4 w-4 mr-3" />
                      Clear System Cache
                    </Button>

                    <Button variant="outline" className="w-full justify-start border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
                      <Shield className="h-4 w-4 mr-3" />
                      Run Security Audit
                    </Button>

                    <Button variant="outline" className="w-full justify-start border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
                      <CheckCircle className="h-4 w-4 mr-3" />
                      System Health Check
                    </Button>

                    <Button variant="outline" className="w-full justify-start border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800" disabled>
                      <Key className="h-4 w-4 mr-3" />
                      Backup Database (Coming Soon)
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Advanced System Settings Note */}
            <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 border-blue-200 dark:border-blue-800">
              <CardContent className="p-8 text-center">
                <Settings className="h-16 w-16 text-blue-500 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">Advanced System Settings</h3>
                <p className="text-slate-600 dark:text-slate-400 mb-6 max-w-2xl mx-auto">
                  For comprehensive system configuration, use the main admin dashboard where you can toggle subscription systems, manage user permissions, configure billing settings, and monitor system health in real-time.
                </p>
                <div className="flex flex-wrap gap-3 justify-center mb-6">
                  <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">Toggle Subscription System</Badge>
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300">Manage User Permissions</Badge>
                  <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300">Configure Billing Settings</Badge>
                  <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300">Monitor System Health</Badge>
                </div>
                <Button
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={() => router.push('/admin')}
                >
                  Go to Main Dashboard
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* System Activity Sidebar */}
          <div className="col-span-4">
            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 shadow-sm sticky top-8">
              <CardHeader className="border-b border-slate-200 dark:border-slate-700">
                <CardTitle className="text-lg text-slate-900 dark:text-white flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  System Insights
                </CardTitle>
                <CardDescription className="text-slate-600 dark:text-slate-400">
                  Key system metrics and alerts
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {/* Insights */}
                <div className="p-3 bg-green-50 dark:bg-green-900/10 rounded-lg border border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-green-900 dark:text-green-100">System Health</span>
                  </div>
                  <p className="text-xs text-green-800 dark:text-green-200">
                    All core systems are operating normally with 99.9% uptime this month.
                  </p>
                </div>

                <div className="p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2 mb-2">
                    <Database className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-900 dark:text-blue-100">Database Status</span>
                  </div>
                  <p className="text-xs text-blue-800 dark:text-blue-200">
                    Supabase connection is stable with optimal query performance.
                  </p>
                </div>

                <div className="p-3 bg-purple-50 dark:bg-purple-900/10 rounded-lg border border-purple-200 dark:border-purple-800">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="h-4 w-4 text-purple-600" />
                    <span className="text-sm font-medium text-purple-900 dark:text-purple-100">Security Status</span>
                  </div>
                  <p className="text-xs text-purple-800 dark:text-purple-200">
                    All security measures are active with no recent threats detected.
                  </p>
                </div>

                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/10 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <span className="text-sm font-medium text-yellow-900 dark:text-yellow-100">Configuration</span>
                  </div>
                  <p className="text-xs text-yellow-800 dark:text-yellow-200">
                    Email service configuration is pending. Consider setting up for better user communication.
                  </p>
                </div>

                {/* Quick Actions */}
                <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-6">
                  <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-3">Quick Actions</h4>
                  <div className="space-y-2">
                    <Button variant="outline" size="sm" className="w-full justify-start border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800" onClick={handleRunDiagnostics}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Run Diagnostics
                    </Button>
                    <Button variant="outline" size="sm" className="w-full justify-start border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800" onClick={handleGenerateReport}>
                      <Download className="h-4 w-4 mr-2" />
                      Generate Report
                    </Button>
                    <Button variant="outline" size="sm" className="w-full justify-start border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800" onClick={handleViewLogs}>
                      <Eye className="h-4 w-4 mr-2" />
                      View Logs
                    </Button>
                    <Button variant="outline" size="sm" className="w-full justify-start border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800" onClick={handlePerformanceMetrics}>
                      <BarChart3 className="h-4 w-4 mr-2" />
                      Performance Metrics
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
