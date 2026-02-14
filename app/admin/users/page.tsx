"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { checkAdminAccess } from "@/lib/admin-utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
  Search,
  Filter,
  MoreHorizontal,
  UserPlus,
  Mail,
  Calendar,
  CreditCard,
  Zap,
  Shield,
  Ban,
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
  Users,
  UserCheck,
  UserX,
  Crown,
  RotateCcw,
  CheckSquare,
  Square,
  Download,
  Upload,
  TrendingUp,
  TrendingDown,
  Eye,
  Edit,
  Trash2,
  Activity,
  Clock,
  DollarSign,
  BarChart3,
  Settings,
  Plus,
  RefreshCw,
  UserCog
} from "lucide-react"
import { usePageTitle } from '@/hooks/use-page-title'

interface UserData {
  id: string
  email: string
  emailConfirmed: boolean
  createdAt: string
  lastSignIn: string | null
  fullName: string | null
  avatarUrl: string | null
  subscriptionPlan: string
  subscriptionStatus: string
  deploymentsThisMonth: number
  githubPushesThisMonth: number
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  lastPaymentDate: string | null
  cancelAtPeriodEnd: boolean
  isAdmin: boolean
  hasProfile: boolean
  hasSettings: boolean
}

export default function AdminUsersPage() {
  usePageTitle('User Management')
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<UserData[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null)
  const [showUserDialog, setShowUserDialog] = useState(false)

  // Bulk selection state
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())
  const [bulkActionLoading, setBulkActionLoading] = useState(false)

  // Filter states
  const [planFilter, setPlanFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkAdminAndLoadUsers()
  }, [])

  const checkAdminAndLoadUsers = async () => {
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
      await loadUsers()
    } catch (error) {
      console.error('Error checking admin access:', error)
      router.push('/workspace')
    } finally {
      setLoading(false)
    }
  }

  const loadUsers = async () => {
    try {
      // Fetch all users from admin API
      const response = await fetch('/api/admin/users')

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `Failed to fetch users: ${response.status}`)
      }

      const data = await response.json()
      setUsers(data.users || [])
    } catch (error) {
      console.error('Error loading users:', error)
      setUsers([])

      // Show user-friendly error message
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (errorMessage.includes('service role')) {
        alert('Admin user management requires Supabase service role configuration. Please check SUPABASE_SERVICE_ROLE_SETUP.md for setup instructions.')
      } else {
        alert(`Failed to load users: ${errorMessage}`)
      }
    }
  }

  const handleExportUsers = async () => {
    try {
      const reportData = {
        generatedAt: new Date().toISOString(),
        users: users,
        totalUsers: users.length
      }

      const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `users-report-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error exporting users report:', error)
    }
  }

  const handleImportUsers = () => {
    // For now, just show an alert
    alert('User import functionality is not yet implemented. Please check back later.')
  }

  const handleAddUser = () => {
    // For now, just show an alert
    alert('Add user functionality is not yet implemented. Please check back later.')
  }

  // Bulk selection functions
  const handleSelectAll = () => {
    if (selectedUsers.size === filteredUsers.length) {
      setSelectedUsers(new Set())
    } else {
      setSelectedUsers(new Set(filteredUsers.map(u => u.id)))
    }
  }

  const handleSelectUser = (userId: string) => {
    const newSelected = new Set(selectedUsers)
    if (newSelected.has(userId)) {
      newSelected.delete(userId)
    } else {
      newSelected.add(userId)
    }
    setSelectedUsers(newSelected)
  }

  // Bulk actions
  const performBulkAction = async (action: string, targetPlan?: string) => {
    if (selectedUsers.size === 0) {
      alert('Please select users first')
      return
    }

    const confirmMessage = `Are you sure you want to ${action} ${selectedUsers.size} user(s)?`
    if (!confirm(confirmMessage)) return

    setBulkActionLoading(true)

    try {
      const userIds = Array.from(selectedUsers)
      const results = []

      for (const userId of userIds) {
        const response = await fetch('/api/admin/users', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            action,
            data: targetPlan ? { plan: targetPlan } : {}
          })
        })

        if (response.ok) {
          results.push({ userId, success: true })
        } else {
          const error = await response.json()
          results.push({ userId, success: false, error: error.error })
        }
      }

      const successCount = results.filter(r => r.success).length
      const failureCount = results.filter(r => !r.success).length

      if (successCount > 0) {
        alert(`✅ Successfully ${action} ${successCount} user(s)`)
      }
      if (failureCount > 0) {
        alert(`❌ Failed to ${action} ${failureCount} user(s)`)
      }

      // Clear selection and reload
      setSelectedUsers(new Set())
      await loadUsers()

    } catch (error) {
      console.error('Bulk action error:', error)
      alert('Error performing bulk action')
    } finally {
      setBulkActionLoading(false)
    }
  }

  const handleRefreshUsers = async () => {
    await loadUsers()
  }

  const handleBulkUserImport = () => {
    // Navigate to bulk user import
    // For now, just show an alert
    alert('Bulk user import feature is not yet implemented. Please check back later.')
  }

  const handleSendNewsletter = () => {
    // Navigate to send newsletter
    // For now, just show an alert
    alert('Send newsletter feature is not yet implemented. Please check back later.')
  }

  const handleViewUserAnalytics = () => {
    // Navigate to user analytics dashboard
    // For now, just show an alert
    alert('User analytics feature is not yet implemented. Please check back later.')
  }

  const handleUserSettings = () => {
    // Navigate to user settings
    // For now, just show an alert
    alert('User settings feature is not yet implemented. Please check back later.')
  }

  const handleSendMessage = () => {
    // Send message to user
    // For now, just show an alert
    alert('Send message feature is not yet implemented. Please check back later.')
  }

  const handleManageSubscription = () => {
    // Manage user subscription
    // For now, just show an alert
    alert('Manage subscription feature is not yet implemented. Please check back later.')
  }

  const handleUserSettingsDialog = () => {
    // Open user settings dialog
    // For now, just show an alert
    alert('User settings dialog is not yet implemented. Please check back later.')
  }

  // Enhanced filtering
  const filteredUsers = users.filter(user => {
    const matchesSearch = user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (user.fullName && user.fullName.toLowerCase().includes(searchQuery.toLowerCase()))

    const matchesPlan = planFilter === "all" || user.subscriptionPlan === planFilter
    const matchesStatus = statusFilter === "all" || user.subscriptionStatus === statusFilter

    return matchesSearch && matchesPlan && matchesStatus
  })

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800">Active</Badge>
      case 'inactive':
        return <Badge variant="secondary">Inactive</Badge>
      case 'trialing':
        return <Badge className="bg-blue-100 text-blue-800">Trial</Badge>
      case 'past_due':
        return <Badge className="bg-yellow-100 text-yellow-800">Past Due</Badge>
      case 'canceled':
        return <Badge className="bg-red-100 text-red-800">Canceled</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getPlanBadge = (plan: string) => {
    switch (plan) {
      case 'free':
        return <Badge variant="outline">Free</Badge>
      case 'pro':
        return <Badge className="bg-purple-100 text-purple-800">Pro</Badge>
      case 'teams':
        return <Badge className="bg-blue-100 text-blue-800">Teams</Badge>
      case 'enterprise':
        return <Badge className="bg-orange-100 text-orange-800">Enterprise</Badge>
      default:
        return <Badge variant="outline">{plan}</Badge>
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading user management...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Clean Header */}
      <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-slate-200/50 dark:border-slate-700/50">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
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
                  <Users className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 dark:text-white">User Management</h1>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Monitor and manage user accounts across the platform</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800">
                <Shield className="h-3 w-3 mr-1" />
                Admin Access
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        {/* Horizontal Action Bar */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search users by email or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-80 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                />
              </div>
              <select
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
              >
                <option value="all">All Plans</option>
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="teams">Teams</option>
                <option value="enterprise">Enterprise</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="trialing">Trial</option>
                <option value="past_due">Past Due</option>
                <option value="canceled">Canceled</option>
              </select>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={handleExportUsers} className="border-slate-200 dark:border-slate-700">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button variant="outline" size="sm" onClick={handleImportUsers} className="border-slate-200 dark:border-slate-700">
                <Upload className="h-4 w-4 mr-2" />
                Import
              </Button>
              <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleAddUser}>
                <UserPlus className="h-4 w-4 mr-2" />
                Add User
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
                  <p className="text-3xl font-bold">{users.length.toLocaleString()}</p>
                  <p className="text-blue-200 text-xs mt-1">
                    <TrendingUp className="h-3 w-3 inline mr-1" />
                    +12% this month
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
                  <p className="text-green-100 text-sm font-medium">Active Subscribers</p>
                  <p className="text-3xl font-bold">
                    {users.filter(u => u.subscriptionStatus === 'active').length.toLocaleString()}
                  </p>
                  <p className="text-green-200 text-xs mt-1">
                    <TrendingUp className="h-3 w-3 inline mr-1" />
                    +8% this month
                  </p>
                </div>
                <UserCheck className="h-8 w-8 text-green-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100 text-sm font-medium">Paid Users</p>
                  <p className="text-3xl font-bold">
                    {users.filter(u => u.subscriptionPlan !== 'free').length.toLocaleString()}
                  </p>
                  <p className="text-purple-200 text-xs mt-1">
                    <TrendingUp className="h-3 w-3 inline mr-1" />
                    +15% this month
                  </p>
                </div>
                <Crown className="h-8 w-8 text-purple-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-orange-100 text-sm font-medium">Monthly Deployments</p>
                  <p className="text-3xl font-bold">
                    {users.reduce((sum, u) => sum + u.deploymentsThisMonth, 0).toLocaleString()}
                  </p>
                  <p className="text-orange-200 text-xs mt-1">
                    <Activity className="h-3 w-3 inline mr-1" />
                    Active usage
                  </p>
                </div>
                <Zap className="h-8 w-8 text-orange-200" />
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
                  <UserCheck className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {users.filter(u => u.subscriptionPlan === 'pro' || u.subscriptionPlan === 'creator').length}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Creator Plan Users</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {users.filter(u => u.emailConfirmed).length}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Verified Emails</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 dark:bg-yellow-900/20 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {users.filter(u => u.subscriptionStatus === 'past_due').length}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Past Due</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 dark:bg-red-900/20 rounded-lg">
                  <UserX className="h-4 w-4 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {users.filter(u => u.subscriptionStatus === 'canceled').length}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Canceled</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-12 gap-8">
          {/* Main Content */}
          <div className="col-span-8">
            {/* Users Table */}
            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 shadow-sm">
              <CardHeader className="border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg text-slate-900 dark:text-white">Users ({filteredUsers.length})</CardTitle>
                    <CardDescription className="text-slate-600 dark:text-slate-400">
                      Manage user accounts, subscriptions, and access levels
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" className="border-slate-200 dark:border-slate-700" onClick={handleRefreshUsers}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </div>

            {/* Bulk Actions Toolbar */}
            {selectedUsers.size > 0 && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <span className="text-sm font-medium text-blue-900">
                  {selectedUsers.size} user(s) selected
                </span>

                <div className="flex gap-2 ml-auto">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => performBulkAction('upgrade_to_pro')}
                    disabled={bulkActionLoading}
                    className="text-green-700 border-green-300 hover:bg-green-50"
                  >
                    <TrendingUp className="h-4 w-4 mr-2" />
                    {bulkActionLoading ? 'Upgrading...' : 'Upgrade to Pro'}
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => performBulkAction('downgrade_to_free')}
                    disabled={bulkActionLoading}
                    className="text-orange-700 border-orange-300 hover:bg-orange-50"
                  >
                    <TrendingDown className="h-4 w-4 mr-2" />
                    {bulkActionLoading ? 'Downgrading...' : 'Downgrade to Free'}
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => performBulkAction('reset_usage')}
                    disabled={bulkActionLoading}
                    className="text-blue-700 border-blue-300 hover:bg-blue-50"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    {bulkActionLoading ? 'Resetting...' : 'Reset Usage'}
                  </Button>
                </div>
              </div>
            )}

            {/* Filters and Search */}
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users by email or name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <select
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="all">All Plans</option>
                <option value="free">Free</option>
                <option value="pro">Pro</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="trialing">Trial</option>
                <option value="past_due">Past Due</option>
              </select>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSelectAll}
                      className="p-0 h-auto"
                    >
                      {selectedUsers.size === filteredUsers.length && filteredUsers.length > 0 ? (
                        <CheckSquare className="h-4 w-4" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </Button>
                  </TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Profile</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((userData) => (
                  <TableRow key={userData.id}>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSelectUser(userData.id)}
                        className="p-0 h-auto"
                      >
                        {selectedUsers.has(userData.id) ? (
                          <CheckSquare className="h-4 w-4" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={userData.avatarUrl || undefined} />
                          <AvatarFallback>
                            {userData.email.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{userData.fullName || 'No name set'}</p>
                          <p className="text-sm text-muted-foreground">{userData.email}</p>
                          {userData.isAdmin && (
                            <Badge variant="secondary" className="text-xs mt-1">
                              Admin
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{getPlanBadge(userData.subscriptionPlan)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {getStatusBadge(userData.subscriptionStatus)}
                        {!userData.emailConfirmed && (
                          <Badge variant="outline" className="text-xs">
                            Email not confirmed
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className="text-xs text-muted-foreground">
                          Deployments: {userData.deploymentsThisMonth}/Unlimited
                        </div>
                        <div className="text-xs text-muted-foreground">
                          GitHub: {userData.githubPushesThisMonth}/2
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          {new Date(userData.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {userData.hasProfile ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-yellow-500" />
                        )}
                        <span className="text-xs">
                          {userData.hasProfile ? 'Complete' : 'Incomplete'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => {
                            setSelectedUser(userData)
                            setShowUserDialog(true)
                          }}>
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Mail className="h-4 w-4 mr-2" />
                            Send Email
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />

                          {/* Subscription Management */}
                          {userData.subscriptionPlan !== 'pro' && (
                            <DropdownMenuItem
                              onClick={async () => {
                                if (confirm(`Upgrade ${userData.email} to Pro plan?`)) {
                                  try {
                                    const response = await fetch('/api/admin/users', {
                                      method: 'PATCH',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        userId: userData.id,
                                        action: 'upgrade_to_pro'
                                      })
                                    })

                                    if (response.ok) {
                                      alert('User upgraded to Pro successfully!')
                                      await loadUsers()
                                    } else {
                                      const err = await response.json()
                                      alert(err.error || 'Failed to upgrade user')
                                    }
                                  } catch (error) {
                                    console.error('Error upgrading user:', error)
                                    alert('Error upgrading user')
                                  }
                                }
                              }}
                              className="text-green-600"
                            >
                              <TrendingUp className="h-4 w-4 mr-2" />
                              Upgrade to Pro
                            </DropdownMenuItem>
                          )}

                          {(userData.subscriptionPlan === 'pro' || userData.subscriptionPlan === 'creator') && (
                            <DropdownMenuItem
                              onClick={async () => {
                                if (confirm(`Downgrade ${userData.email} to Free plan?`)) {
                                  try {
                                    const response = await fetch('/api/admin/users', {
                                      method: 'PATCH',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        userId: userData.id,
                                        action: 'downgrade_to_free'
                                      })
                                    })

                                    if (response.ok) {
                                      alert('User downgraded to Free successfully!')
                                      await loadUsers()
                                    } else {
                                      const err = await response.json()
                                      alert(err.error || 'Failed to downgrade user')
                                    }
                                  } catch (error) {
                                    console.error('Error downgrading user:', error)
                                    alert('Error downgrading user')
                                  }
                                }
                              }}
                              className="text-orange-600"
                            >
                              <TrendingDown className="h-4 w-4 mr-2" />
                              Downgrade to Free
                            </DropdownMenuItem>
                          )}

                          <DropdownMenuItem
                            onClick={async () => {
                              if (confirm(`Reset usage counters for ${userData.email}?`)) {
                                try {
                                  const response = await fetch('/api/admin/users', {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      userId: userData.id,
                                      action: 'reset_usage'
                                    })
                                  })

                                  if (response.ok) {
                                    alert('Usage counters reset successfully!')
                                    await loadUsers()
                                  } else {
                                    const err = await response.json()
                                    alert(err.error || 'Failed to reset usage')
                                  }
                                } catch (error) {
                                  console.error('Error resetting usage:', error)
                                  alert('Error resetting usage')
                                }
                              }
                            }}
                            className="text-blue-600"
                          >
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Reset Usage
                          </DropdownMenuItem>

                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={async () => {
                              if (confirm(`Permanently delete user ${userData.email}? This cannot be undone.`)) {
                                try {
                                  const response = await fetch('/api/admin/users', {
                                    method: 'DELETE',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ userId: userData.id })
                                  })

                                  if (response.ok) {
                                    alert('User deleted successfully!')
                                    await loadUsers()
                                  } else {
                                    const err = await response.json().catch(() => ({}))
                                    alert(err.error || 'Failed to delete user')
                                  }
                                } catch (error) {
                                  console.error('Error deleting user:', error)
                                  alert('Error deleting user')
                                }
                              }
                            }}
                          >
                            Delete User
                          </DropdownMenuItem>
                          {!userData.hasProfile && (
                            <DropdownMenuItem
                              onClick={async () => {
                                try {
                                  const response = await fetch('/api/admin/users', {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      userId: userData.id,
                                      action: 'create_profile',
                                      data: { fullName: userData.email.split('@')[0] }
                                    })
                                  })

                                  if (response.ok) {
                                    alert('Profile created successfully!')
                                    await loadUsers()
                                  } else {
                                    alert('Failed to create profile')
                                  }
                                } catch (error) {
                                  console.error('Error creating profile:', error)
                                  alert('Error creating profile')
                                }
                              }}
                            >
                              <UserPlus className="h-4 w-4 mr-2" />
                              Create Profile
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={async () => {
                              const action = confirm('Reset monthly usage counters for this user?')
                              if (action) {
                                try {
                                  const response = await fetch('/api/admin/users', {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      userId: userData.id,
                                      action: 'reset_usage',
                                      data: {}
                                    })
                                  })

                                  if (response.ok) {
                                    alert('Usage counters reset successfully!')
                                    await loadUsers()
                                  } else {
                                    alert('Failed to reset usage counters')
                                  }
                                } catch (error) {
                                  console.error('Error resetting usage counters:', error)
                                  alert('Error resetting usage counters')
                                }
                              }
                            }}
                          >
                            <Zap className="h-4 w-4 mr-2" />
                            Reset Usage
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={async () => {
                              const newPlan = prompt('Enter new plan (free/pro/teams/enterprise):', userData.subscriptionPlan)
                              if (newPlan && ['free', 'pro', 'teams', 'enterprise'].includes(newPlan)) {
                                try {
                                  const response = await fetch('/api/admin/users', {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      userId: userData.id,
                                      action: 'update_plan',
                                      data: { plan: newPlan }
                                    })
                                  })

                                  if (response.ok) {
                                    alert('Plan updated successfully!')
                                    await loadUsers()
                                  } else {
                                    alert('Failed to update plan')
                                  }
                                } catch (error) {
                                  console.error('Error updating plan:', error)
                                  alert('Error updating plan')
                                }
                              }
                            }}
                          >
                            <CreditCard className="h-4 w-4 mr-2" />
                            Change Plan
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={async () => {
                              if (confirm(`Are you sure you want to suspend user ${userData.email}?`)) {
                                try {
                                  const response = await fetch('/api/admin/users', {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      userId: userData.id,
                                      action: 'suspend_user'
                                    })
                                  })

                                  if (response.ok) {
                                    alert('User suspended successfully!')
                                    await loadUsers()
                                  } else {
                                    alert('Failed to suspend user')
                                  }
                                } catch (error) {
                                  console.error('Error suspending user:', error)
                                  alert('Error suspending user')
                                }
                              }
                            }}
                          >
                            <Ban className="h-4 w-4 mr-2" />
                            Suspend User
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
          </div>

          {/* Activity Feed Sidebar */}
          <div className="col-span-4">
            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 shadow-sm sticky top-8">
              <CardHeader className="border-b border-slate-200 dark:border-slate-700">
                <CardTitle className="text-lg text-slate-900 dark:text-white flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Recent Activity
                </CardTitle>
                <CardDescription className="text-slate-600 dark:text-slate-400">
                  Latest user actions and system events
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {/* Activity Items */}
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
                    <UserPlus className="h-4 w-4 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">New user registered</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">john.doe@example.com joined 2 minutes ago</p>
                  </div>
                  <span className="text-xs text-slate-500">2m</span>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                    <TrendingUp className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">User upgraded</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">sarah.smith upgraded to Pro plan</p>
                  </div>
                  <span className="text-xs text-slate-500">15m</span>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                    <Zap className="h-4 w-4 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Deployment completed</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">alex.wilson deployed 3 sites</p>
                  </div>
                  <span className="text-xs text-slate-500">1h</span>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-yellow-100 dark:bg-yellow-900/20 rounded-lg">
                    <Mail className="h-4 w-4 text-yellow-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Email verification</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">mike.jones verified their email</p>
                  </div>
                  <span className="text-xs text-slate-500">2h</span>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-red-100 dark:bg-red-900/20 rounded-lg">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Payment failed</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">Payment retry for emily.davis</p>
                  </div>
                  <span className="text-xs text-slate-500">4h</span>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-orange-100 dark:bg-orange-900/20 rounded-lg">
                    <Settings className="h-4 w-4 text-orange-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Profile updated</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">david.brown updated their profile</p>
                  </div>
                  <span className="text-xs text-slate-500">6h</span>
                </div>

                {/* Quick Actions */}
                <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-6">
                  <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-3">Quick Actions</h4>
                  <div className="space-y-2">
                    <Button variant="outline" size="sm" className="w-full justify-start border-slate-200 dark:border-slate-700" onClick={handleBulkUserImport}>
                      <UserCog className="h-4 w-4 mr-2" />
                      Bulk User Import
                    </Button>
                    <Button variant="outline" size="sm" className="w-full justify-start border-slate-200 dark:border-slate-700" onClick={handleSendNewsletter}>
                      <Mail className="h-4 w-4 mr-2" />
                      Send Newsletter
                    </Button>
                    <Button variant="outline" size="sm" className="w-full justify-start border-slate-200 dark:border-slate-700" onClick={handleViewUserAnalytics}>
                      <BarChart3 className="h-4 w-4 mr-2" />
                      View Analytics
                    </Button>
                    <Button variant="outline" size="sm" className="w-full justify-start border-slate-200 dark:border-slate-700" onClick={handleUserSettings}>
                      <Settings className="h-4 w-4 mr-2" />
                      User Settings
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
        <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>User Details</DialogTitle>
              <DialogDescription>
                Detailed information about {selectedUser?.email}
              </DialogDescription>
            </DialogHeader>

            {selectedUser && (
              <div className="space-y-6">
                {/* User Info */}
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={selectedUser.avatarUrl || undefined} />
                    <AvatarFallback className="text-lg">
                      {selectedUser.email.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="text-lg font-semibold">
                      {selectedUser.fullName || 'No name set'}
                    </h3>
                    <p className="text-muted-foreground">{selectedUser.email}</p>
                    <div className="flex items-center gap-2 mt-2">
                      {getPlanBadge(selectedUser.subscriptionPlan)}
                      {getStatusBadge(selectedUser.subscriptionStatus)}
                      {selectedUser.isAdmin && (
                        <Badge variant="secondary" className="bg-red-100 text-red-800">
                          Admin
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Account Details */}
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Mail className="h-4 w-4 text-blue-500" />
                        <span className="text-sm font-medium">Email Status</span>
                      </div>
                      <p className="text-lg font-semibold">
                        {selectedUser.emailConfirmed ? 'Verified' : 'Unverified'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Last sign in: {selectedUser.lastSignIn
                          ? new Date(selectedUser.lastSignIn).toLocaleDateString()
                          : 'Never'
                        }
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <UserPlus className="h-4 w-4 text-green-500" />
                        <span className="text-sm font-medium">Profile Status</span>
                      </div>
                      <p className="text-lg font-semibold">
                        {selectedUser.hasProfile ? 'Complete' : 'Incomplete'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Settings: {selectedUser.hasSettings ? 'Configured' : 'Not set'}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Usage Details */}
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Zap className="h-4 w-4 text-yellow-500" />
                        <span className="text-sm font-medium">Deployments</span>
                      </div>
                      <p className="text-2xl font-bold">{selectedUser.deploymentsThisMonth}</p>
                      <p className="text-xs text-muted-foreground">
                        Limit: Unlimited/month
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <CreditCard className="h-4 w-4 text-purple-500" />
                        <span className="text-sm font-medium">GitHub Pushes</span>
                      </div>
                      <p className="text-2xl font-bold">{selectedUser.githubPushesThisMonth}</p>
                      <p className="text-xs text-muted-foreground">
                        Limit: 2/month
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="h-4 w-4 text-blue-500" />
                        <span className="text-sm font-medium">Member Since</span>
                      </div>
                      <p className="text-lg font-semibold">
                        {new Date(selectedUser.createdAt).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {Math.floor((Date.now() - new Date(selectedUser.createdAt).getTime()) / (1000 * 60 * 60 * 24))} days ago
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Billing Information */}
                {selectedUser.stripeCustomerId && (
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <CreditCard className="h-4 w-4 text-purple-500" />
                        <span className="text-sm font-medium">Stripe Information</span>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p>Customer ID: {selectedUser.stripeCustomerId}</p>
                        {selectedUser.stripeSubscriptionId && (
                          <p>Subscription ID: {selectedUser.stripeSubscriptionId}</p>
                        )}
                        {selectedUser.lastPaymentDate && (
                          <p>Last Payment: {new Date(selectedUser.lastPaymentDate).toLocaleDateString()}</p>
                        )}
                        {selectedUser.cancelAtPeriodEnd && (
                          <p className="text-red-600">Cancels at period end</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={handleSendMessage}>
                    <Mail className="h-4 w-4 mr-2" />
                    Send Message
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={handleManageSubscription}>
                    <CreditCard className="h-4 w-4 mr-2" />
                    Manage Subscription
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={handleUserSettingsDialog}>
                    <Shield className="h-4 w-4 mr-2" />
                    User Settings
                  </Button>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowUserDialog(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
