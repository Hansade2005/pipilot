"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { checkAdminAccess } from "@/lib/admin-utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ArrowLeft,
  Search,
  Filter,
  CreditCard,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  XCircle,
  MoreHorizontal,
  Receipt,
  RefreshCw,
  Calendar,
  Shield,
  Users,
  Activity,
  PieChart,
  BarChart3,
  Download,
  Settings,
  Eye,
  Target,
  Zap,
  Globe,
  Clock,
  LineChart
} from "lucide-react"
import { usePageTitle } from '@/hooks/use-page-title'

interface SubscriptionData {
  id: string
  user_id: string
  user_email: string
  user_name: string | null
  subscription_plan: string
  subscription_status: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  deployments_this_month: number
  github_pushes_this_month: number
  subscription_start_date: string | null
  subscription_end_date: string | null
  last_payment_date: string | null
  cancel_at_period_end: boolean
  created_at: string
}

export default function AdminBillingPage() {
  usePageTitle('Billing Management')
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [subscriptions, setSubscriptions] = useState<SubscriptionData[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedSubscription, setSelectedSubscription] = useState<SubscriptionData | null>(null)
  const [showSubscriptionDialog, setShowSubscriptionDialog] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkAdminAndLoadSubscriptions()
  }, [])

  const checkAdminAndLoadSubscriptions = async () => {
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
      await loadSubscriptions()
    } catch (error) {
      console.error('Error checking admin access:', error)
      router.push('/workspace')
    } finally {
      setLoading(false)
    }
  }

  const loadSubscriptions = async () => {
    try {
      // Fetch subscriptions - we'll manually join with profiles
      const { data: userSettings, error: settingsError } = await supabase
        .from('user_settings')
        .select('*')
        .neq('subscription_plan', 'free')
        .order('created_at', { ascending: false })

      if (settingsError) {
        console.error('Error fetching subscriptions:', settingsError)
        return
      }

      console.log('Loaded user settings:', userSettings?.length || 0)

      if (!userSettings || userSettings.length === 0) {
        setSubscriptions([])
        return
      }

      // Fetch profiles for these users
      const userIds = userSettings.map(s => s.user_id)
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', userIds)

      if (profilesError) {
        console.error('Error fetching profiles:', profilesError)
      }

      console.log('Loaded profiles:', profiles?.length || 0)

      // Create a map for quick lookup
      const profilesMap = new Map(
        profiles?.map(p => [p.id, p]) || []
      )

      // Transform data to match our interface
      const transformedData = userSettings.map(setting => {
        const profile = profilesMap.get(setting.user_id)
        return {
          id: setting.id,
          user_id: setting.user_id,
          user_email: profile?.email || 'No email',
          user_name: profile?.full_name || null,
          subscription_plan: setting.subscription_plan,
          subscription_status: setting.subscription_status || 'active',
          stripe_customer_id: setting.stripe_customer_id,
          stripe_subscription_id: setting.stripe_subscription_id,
          deployments_this_month: setting.deployments_this_month || 0,
          github_pushes_this_month: setting.github_pushes_this_month || 0,
          subscription_start_date: setting.subscription_start_date,
          subscription_end_date: setting.subscription_end_date,
          last_payment_date: setting.last_payment_date,
          cancel_at_period_end: setting.cancel_at_period_end || false,
          created_at: setting.created_at
        }
      })

      console.log('Transformed subscriptions:', transformedData.length)
      setSubscriptions(transformedData)
    } catch (error) {
      console.error('Error loading subscriptions:', error)
    }
  }

  const handleFilter = () => {
    // For now, just show an alert
    alert('Advanced filtering is not yet implemented. Please use the search box for basic filtering.')
  }

  const handleExportBillingReport = async () => {
    try {
      const reportData = {
        generatedAt: new Date().toISOString(),
        subscriptions: subscriptions,
        totalSubscriptions: subscriptions.length,
        activeSubscriptions: subscriptions.filter(sub => sub.subscription_status === 'active' || sub.subscription_status === 'trialing').length
      }

      const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `billing-report-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error exporting billing report:', error)
    }
  }

  const handleExportRevenueReport = () => {
    // Export revenue report
    // For now, just show an alert
    alert('Exporting revenue report... This feature is not yet implemented. Please check back later.')
  }

  const handleConfigureBilling = () => {
    // Configure billing settings
    // For now, just show an alert
    alert('Configuring billing settings... This feature is not yet implemented. Please check back later.')
  }

  const handleSendPaymentReminders = () => {
    // Send payment reminders
    // For now, just show an alert
    alert('Sending payment reminders... This feature is not yet implemented. Please check back later.')
  }

  const handleViewBillingAnalytics = () => {
    // View billing analytics
    // For now, just show an alert
    alert('Viewing billing analytics... This feature is not yet implemented. Please check back later.')
  }

  const handleViewInvoices = () => {
    // View user invoices
    // For now, just show an alert
    alert('Viewing invoices... This feature is not yet implemented. Please check back later.')
  }

  const handleUpdatePaymentMethod = () => {
    // Update payment method
    // For now, just show an alert
    alert('Updating payment method... This feature is not yet implemented. Please check back later.')
  }

  const handleSendBillingNotification = () => {
    // Send billing notification
    // For now, just show an alert
    alert('Sending billing notification... This feature is not yet implemented. Please check back later.')
  }

  const filteredSubscriptions = subscriptions.filter(sub =>
    sub.user_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (sub.user_name && sub.user_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
    sub.subscription_plan.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800">Active</Badge>
      case 'trialing':
        return <Badge className="bg-blue-100 text-blue-800">Trial</Badge>
      case 'past_due':
        return <Badge className="bg-yellow-100 text-yellow-800">Past Due</Badge>
      case 'canceled':
        return <Badge className="bg-red-100 text-red-800">Canceled</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const getPlanBadge = (plan: string) => {
    switch (plan) {
      case 'pro':
        return <Badge className="bg-purple-100 text-purple-800">$15/month</Badge>
      case 'teams':
        return <Badge className="bg-blue-100 text-blue-800">$25/month</Badge>
      case 'enterprise':
        return <Badge className="bg-orange-100 text-orange-800">$60/month</Badge>
      default:
        return <Badge variant="outline">{plan}</Badge>
    }
  }

  const calculateRevenue = () => {
    return subscriptions.reduce((total, sub) => {
      if (sub.subscription_status === 'active' || sub.subscription_status === 'trialing') {
        // Actual pricing: Creator(pro)=$15, Collaborate(teams)=$25, Scale(enterprise)=$60
        const monthlyRate = (sub.subscription_plan === 'pro' || sub.subscription_plan === 'creator') ? 15 :
                           (sub.subscription_plan === 'teams' || sub.subscription_plan === 'collaborate') ? 25 :
                           (sub.subscription_plan === 'enterprise' || sub.subscription_plan === 'scale') ? 60 : 0
        return total + monthlyRate
      }
      return total
    }, 0)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading billing management...</p>
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
                <CreditCard className="h-7 w-7 text-blue-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">Billing Management</h1>
                <p className="text-slate-300 mt-1">Monitor subscriptions, revenue, and payment processing</p>
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
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search subscriptions by email, name, or plan..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
              />
            </div>
            <Button variant="outline" onClick={handleFilter} className="border-slate-200 dark:border-slate-700">
              <Filter className="h-4 w-4 mr-2" />
              Filter
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={loadSubscriptions} className="border-slate-200 dark:border-slate-700">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button onClick={handleExportBillingReport} className="bg-blue-600 hover:bg-blue-700">
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
          </div>
        </div>

        {/* Primary KPI Cards */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-sm font-medium">Monthly Revenue</p>
                  <p className="text-3xl font-bold">${calculateRevenue()}</p>
                  <p className="text-green-200 text-xs mt-1">
                    <TrendingUp className="h-3 w-3 inline mr-1" />
                    +8% from last month
                  </p>
                </div>
                <DollarSign className="h-8 w-8 text-green-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm font-medium">Active Subscriptions</p>
                  <p className="text-3xl font-bold">{subscriptions.length}</p>
                  <p className="text-blue-200 text-xs mt-1">
                    <Activity className="h-3 w-3 inline mr-1" />
                    {subscriptions.filter(s => s.subscription_status === 'active').length} active
                  </p>
                </div>
                <CreditCard className="h-8 w-8 text-blue-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100 text-sm font-medium">Annual Revenue</p>
                  <p className="text-3xl font-bold">${Math.round(calculateRevenue() * 12)}</p>
                  <p className="text-purple-200 text-xs mt-1">
                    <Target className="h-3 w-3 inline mr-1" />
                    Projected earnings
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-purple-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-red-500 to-red-600 text-white border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-red-100 text-sm font-medium">Past Due</p>
                  <p className="text-3xl font-bold">
                    {subscriptions.filter(s => s.subscription_status === 'past_due').length}
                  </p>
                  <p className="text-red-200 text-xs mt-1">
                    <AlertTriangle className="h-3 w-3 inline mr-1" />
                    Requires attention
                  </p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-200" />
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
                  <Users className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {subscriptions.filter(s => s.subscription_status === 'trialing').length}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Trial Users</p>
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
                    {subscriptions.filter(s => s.cancel_at_period_end).length}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Cancelling Soon</p>
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
                    {Math.round(subscriptions.reduce((acc, sub) => acc + sub.deployments_this_month, 0) / Math.max(subscriptions.length, 1))}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Avg Deployments</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 dark:bg-yellow-900/20 rounded-lg">
                  <Clock className="h-4 w-4 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {Math.round(subscriptions.reduce((acc, sub) => acc + sub.github_pushes_this_month, 0) / Math.max(subscriptions.length, 1))}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Avg GitHub Pushes</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-12 gap-8">
          {/* Main Content */}
          <div className="col-span-8">
            {/* Enhanced Subscriptions Table */}
            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 shadow-sm">
              <CardHeader className="border-b border-slate-200 dark:border-slate-700">
                <CardTitle className="text-xl text-slate-900 dark:text-white flex items-center gap-2">
                  <CreditCard className="h-6 w-6" />
                  Active Subscriptions ({filteredSubscriptions.length})
                </CardTitle>
                <CardDescription className="text-slate-600 dark:text-slate-400">
                  Monitor and manage all paid subscriptions across all plans
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <TableHead className="text-slate-900 dark:text-white font-semibold">Customer</TableHead>
                        <TableHead className="text-slate-900 dark:text-white font-semibold">Plan</TableHead>
                        <TableHead className="text-slate-900 dark:text-white font-semibold">Status</TableHead>
                        <TableHead className="text-slate-900 dark:text-white font-semibold">Usage</TableHead>
                        <TableHead className="text-slate-900 dark:text-white font-semibold">Next Billing</TableHead>
                        <TableHead className="text-slate-900 dark:text-white font-semibold">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSubscriptions.map((subscription) => (
                        <TableRow key={subscription.id} className="border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <TableCell>
                            <div>
                              <p className="font-medium text-slate-900 dark:text-white">{subscription.user_name || 'No name'}</p>
                              <p className="text-sm text-slate-600 dark:text-slate-400">{subscription.user_email}</p>
                            </div>
                          </TableCell>
                          <TableCell>{getPlanBadge(subscription.subscription_plan)}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {getStatusBadge(subscription.subscription_status)}
                              {subscription.cancel_at_period_end && (
                                <Badge variant="outline" className="text-xs border-red-200 text-red-700 dark:border-red-800 dark:text-red-300">
                                  Cancels at period end
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div className="text-xs text-slate-600 dark:text-slate-400">
                                Deployments: {subscription.deployments_this_month}/Unlimited
                              </div>
                              <div className="text-xs text-slate-600 dark:text-slate-400">
                                GitHub: {subscription.github_pushes_this_month}/2
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-slate-400" />
                              <span className="text-sm text-slate-900 dark:text-white">
                                {subscription.subscription_end_date
                                  ? new Date(subscription.subscription_end_date).toLocaleDateString()
                                  : 'N/A'
                                }
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="hover:bg-slate-100 dark:hover:bg-slate-800">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="border-slate-200 dark:border-slate-700">
                                <DropdownMenuItem onClick={() => {
                                  setSelectedSubscription(subscription)
                                  setShowSubscriptionDialog(true)
                                }} className="hover:bg-slate-100 dark:hover:bg-slate-800">
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem className="hover:bg-slate-100 dark:hover:bg-slate-800">
                                  <Receipt className="h-4 w-4 mr-2" />
                                  View Invoices
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20">
                                  <AlertTriangle className="h-4 w-4 mr-2" />
                                  Pause Subscription
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Cancel Subscription
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {filteredSubscriptions.length === 0 && (
                  <div className="text-center py-12">
                    <CreditCard className="h-16 w-16 text-slate-400 mx-auto mb-4" />
                    <p className="text-slate-600 dark:text-slate-400 text-lg font-medium">No active subscriptions found</p>
                    <p className="text-sm text-slate-500 mt-2">
                      {searchQuery ? 'Try adjusting your search terms' : 'Subscriptions will appear here when users upgrade from free plans'}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Billing Activity Sidebar */}
          <div className="col-span-4">
            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 shadow-sm sticky top-8">
              <CardHeader className="border-b border-slate-200 dark:border-slate-700">
                <CardTitle className="text-lg text-slate-900 dark:text-white flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Billing Insights
                </CardTitle>
                <CardDescription className="text-slate-600 dark:text-slate-400">
                  Key metrics and trends
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {/* Insights */}
                <div className="p-3 bg-green-50 dark:bg-green-900/10 rounded-lg border border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-green-900 dark:text-green-100">Revenue Growth</span>
                  </div>
                  <p className="text-xs text-green-800 dark:text-green-200">
                    Monthly recurring revenue increased by 8% this month, driven by Pro plan upgrades.
                  </p>
                </div>

                <div className="p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-900 dark:text-blue-100">High Engagement</span>
                  </div>
                  <p className="text-xs text-blue-800 dark:text-blue-200">
                    {subscriptions.filter(s => s.subscription_status === 'active').length} active subscriptions with consistent usage patterns.
                  </p>
                </div>

                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/10 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <span className="text-sm font-medium text-yellow-900 dark:text-yellow-100">Attention Needed</span>
                  </div>
                  <p className="text-xs text-yellow-800 dark:text-yellow-200">
                    {subscriptions.filter(s => s.cancel_at_period_end).length} subscriptions set to cancel. Consider retention outreach.
                  </p>
                </div>

                <div className="p-3 bg-purple-50 dark:bg-purple-900/10 rounded-lg border border-purple-200 dark:border-purple-800">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="h-4 w-4 text-purple-600" />
                    <span className="text-sm font-medium text-purple-900 dark:text-purple-100">Conversion Success</span>
                  </div>
                  <p className="text-xs text-purple-800 dark:text-purple-200">
                    Collaborate plan showing strong adoption with {subscriptions.filter(s => s.subscription_plan === 'teams' || s.subscription_plan === 'collaborate').length} active subscriptions.
                  </p>
                </div>

                {/* Quick Actions */}
                <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-6">
                  <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-3">Quick Actions</h4>
                  <div className="space-y-2">
                    <Button variant="outline" size="sm" className="w-full justify-start border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800" onClick={handleExportRevenueReport}>
                      <Download className="h-4 w-4 mr-2" />
                      Export Revenue Report
                    </Button>
                    <Button variant="outline" size="sm" className="w-full justify-start border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800" onClick={handleConfigureBilling}>
                      <Settings className="h-4 w-4 mr-2" />
                      Configure Billing
                    </Button>
                    <Button variant="outline" size="sm" className="w-full justify-start border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800" onClick={handleSendPaymentReminders}>
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Send Payment Reminders
                    </Button>
                    <Button variant="outline" size="sm" className="w-full justify-start border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800" onClick={handleViewBillingAnalytics}>
                      <BarChart3 className="h-4 w-4 mr-2" />
                      View Analytics
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Subscription Details Dialog */}
        <Dialog open={showSubscriptionDialog} onOpenChange={setShowSubscriptionDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Subscription Details</DialogTitle>
              <DialogDescription>
                Detailed information about {selectedSubscription?.user_email}'s subscription
              </DialogDescription>
            </DialogHeader>

            {selectedSubscription && (
              <div className="space-y-6">
                {/* Customer Info */}
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                    <span className="text-lg font-semibold text-primary">
                      {selectedSubscription.user_email.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">
                      {selectedSubscription.user_name || 'No name'}
                    </h3>
                    <p className="text-muted-foreground">{selectedSubscription.user_email}</p>
                    <div className="flex items-center gap-2 mt-2">
                      {getPlanBadge(selectedSubscription.subscription_plan)}
                      {getStatusBadge(selectedSubscription.subscription_status)}
                    </div>
                  </div>
                </div>

                {/* Subscription Details */}
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <CreditCard className="h-4 w-4 text-blue-500" />
                        <span className="text-sm font-medium">Stripe Customer ID</span>
                      </div>
                      <p className="text-sm font-mono break-all">
                        {selectedSubscription.stripe_customer_id || 'Not available'}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="h-4 w-4 text-green-500" />
                        <span className="text-sm font-medium">Subscription ID</span>
                      </div>
                      <p className="text-sm font-mono break-all">
                        {selectedSubscription.stripe_subscription_id || 'Not available'}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Usage Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {selectedSubscription.deployments_this_month}
                      </div>
                      <p className="text-xs text-muted-foreground">Deployments (Month)</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold text-purple-600">
                        {selectedSubscription.github_pushes_this_month}
                      </div>
                      <p className="text-xs text-muted-foreground">GitHub Pushes (Month)</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {selectedSubscription.subscription_plan === 'pro' || selectedSubscription.subscription_plan === 'creator' ? 15 :
                         selectedSubscription.subscription_plan === 'teams' || selectedSubscription.subscription_plan === 'collaborate' ? 25 :
                         selectedSubscription.subscription_plan === 'enterprise' || selectedSubscription.subscription_plan === 'scale' ? 60 : 0}
                      </div>
                      <p className="text-xs text-muted-foreground">Monthly Rate</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Subscription Timeline */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Subscription Timeline</h4>
                  <div className="space-y-2">
                    {selectedSubscription.subscription_start_date && (
                      <div className="flex items-center gap-3 text-sm">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span>Started: {new Date(selectedSubscription.subscription_start_date).toLocaleDateString()}</span>
                      </div>
                    )}
                    {selectedSubscription.last_payment_date && (
                      <div className="flex items-center gap-3 text-sm">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        <span>Last Payment: {new Date(selectedSubscription.last_payment_date).toLocaleDateString()}</span>
                      </div>
                    )}
                    {selectedSubscription.subscription_end_date && (
                      <div className="flex items-center gap-3 text-sm">
                        <div className={`w-2 h-2 rounded-full ${selectedSubscription.cancel_at_period_end ? 'bg-red-500' : 'bg-yellow-500'}`}></div>
                        <span>
                          {selectedSubscription.cancel_at_period_end ? 'Cancels' : 'Renews'}: {new Date(selectedSubscription.subscription_end_date).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={handleViewInvoices}>
                    <Receipt className="h-4 w-4 mr-2" />
                    View Invoices
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={handleUpdatePaymentMethod}>
                    <CreditCard className="h-4 w-4 mr-2" />
                    Update Payment Method
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={handleSendBillingNotification}>
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Send Notification
                  </Button>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSubscriptionDialog(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
