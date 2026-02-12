"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { checkAdminAccess, hasAdminPermission, ADMIN_PERMISSIONS } from "@/lib/admin-utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/use-toast"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  ArrowLeft,
  Globe,
  BarChart3,
  TrendingUp,
  Users,
  Shield,
  Eye,
  Calendar,
  Search,
  Filter,
  Download,
  ExternalLink,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock, Activity,
  Smartphone,
  Settings,
  Monitor,
  Tablet
} from "lucide-react"
import { usePageTitle } from '@/hooks/use-page-title'

interface SiteData {
  id: string
  project_slug: string
  original_slug: string | null
  auth_user_id: string
  auth_username: string
  created_at: string
  updated_at: string
  total_views: number
  last_viewed_at: string | null
  is_active: boolean
  metadata: any
}

interface SiteView {
  id: string
  site_id: string
  viewed_at: string
  user_agent: string
  referrer: string | null
  ip_hash: string
  country: string | null
  device_type: string
}

interface DomainStats {
  totalSites: number
  activeSites: number
  totalViews: number
  avgViewsPerSite: number
  topPerformingSites: SiteData[]
  recentActivity: SiteData[]
  deviceBreakdown: { [key: string]: number }
  countryBreakdown: { [key: string]: number }
}

export default function AdminDomainsPage() {
  usePageTitle('Domain Management')
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [sites, setSites] = useState<SiteData[]>([])
  const [siteViews, setSiteViews] = useState<SiteView[]>([])
  const [stats, setStats] = useState<DomainStats | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [sortBy, setSortBy] = useState("views")
  const [selectedSite, setSelectedSite] = useState<SiteData | null>(null)
  const [siteDetails, setSiteDetails] = useState<SiteView[]>([])
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

      if (!hasAdminPermission(user, ADMIN_PERMISSIONS.DOMAIN_MANAGEMENT)) {
        router.push('/admin')
        return
      }

      setUser(user)
      await loadDomainData()
    } catch (error) {
      console.error('Error checking admin access:', error)
      router.push('/admin')
    } finally {
      setLoading(false)
    }
  }

  const loadDomainData = async () => {
    try {
      const response = await fetch('/api/admin/domains')
      if (!response.ok) {
        throw new Error('Failed to fetch domain data')
      }

      const data = await response.json()
      setSites(data.sites || [])

      // Set stats from API response
      setStats(data.analytics)

      // Load recent views for detailed analytics
      const viewsResponse = await fetch('/api/admin/domains/views?limit=1000')
      if (viewsResponse.ok) {
        const viewsData = await viewsResponse.json()
        setSiteViews(viewsData.views || [])
      }

    } catch (error) {
      console.error('Error loading domain data:', error)
      toast({
        title: "Error",
        description: "Failed to load domain data. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleExportReport = async () => {
    try {
      const reportData = {
        generatedAt: new Date().toISOString(),
        sites: sites,
        stats: stats,
        siteViews: siteViews
      }

      const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `domains-report-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error exporting domains report:', error)
    }
  }

  const handleConfigure = () => {
    // Navigate to system settings for domain configuration
    router.push('/admin/system')
  }

  const calculateStats = (sitesData: SiteData[], viewsData: SiteView[]) => {
    const totalSites = sitesData.length
    const activeSites = sitesData.filter(site => site.is_active).length
    const totalViews = sitesData.reduce((sum, site) => sum + site.total_views, 0)
    const avgViewsPerSite = totalSites > 0 ? Math.round(totalViews / totalSites) : 0

    // Top performing sites
    const topPerformingSites = [...sitesData]
      .sort((a, b) => b.total_views - a.total_views)
      .slice(0, 10)

    // Recent activity (last 7 days)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const recentActivity = sitesData
      .filter(site => site.last_viewed_at && new Date(site.last_viewed_at) > sevenDaysAgo)
      .sort((a, b) => new Date(b.last_viewed_at!).getTime() - new Date(a.last_viewed_at!).getTime())
      .slice(0, 10)

    // Device breakdown
    const deviceBreakdown: { [key: string]: number } = {}
    viewsData.forEach(view => {
      const device = view.device_type || 'unknown'
      deviceBreakdown[device] = (deviceBreakdown[device] || 0) + 1
    })

    // Country breakdown
    const countryBreakdown: { [key: string]: number } = {}
    viewsData.forEach(view => {
      const country = view.country || 'unknown'
      countryBreakdown[country] = (countryBreakdown[country] || 0) + 1
    })

    setStats({
      totalSites,
      activeSites,
      totalViews,
      avgViewsPerSite,
      topPerformingSites,
      recentActivity,
      deviceBreakdown,
      countryBreakdown
    })
  }

  const handleSiteAction = async (siteId: string, action: 'activate' | 'deactivate' | 'delete') => {
    try {
      const response = await fetch('/api/admin/domains', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, siteId }),
      })

      if (!response.ok) {
        throw new Error('Failed to perform action')
      }

      const result = await response.json()

      toast({
        title: "Success",
        description: result.message,
      })

      // Reload data
      await loadDomainData()
    } catch (error) {
      console.error('Error performing site action:', error)
      toast({
        title: "Error",
        description: "Failed to perform action. Please try again.",
        variant: "destructive",
      })
    }
  }

  const loadSiteDetails = async (siteId: string) => {
    try {
      const response = await fetch(`/api/admin/domains/views?siteId=${siteId}&limit=100`)
      if (!response.ok) {
        throw new Error('Failed to fetch site details')
      }

      const data = await response.json()
      setSiteDetails(data.views || [])
    } catch (error) {
      console.error('Error loading site details:', error)
      toast({
        title: "Error",
        description: "Failed to load site details.",
        variant: "destructive",
      })
    }
  }

  const filteredSites = sites.filter(site => {
    const matchesSearch = site.project_slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         site.auth_username.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = filterStatus === 'all' ||
                         (filterStatus === 'active' && site.is_active) ||
                         (filterStatus === 'inactive' && !site.is_active)
    return matchesSearch && matchesStatus
  }).sort((a, b) => {
    switch (sortBy) {
      case 'views':
        return b.total_views - a.total_views
      case 'created':
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      case 'lastViewed':
        const aTime = a.last_viewed_at ? new Date(a.last_viewed_at).getTime() : 0
        const bTime = b.last_viewed_at ? new Date(b.last_viewed_at).getTime() : 0
        return bTime - aTime
      default:
        return 0
    }
  })

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType.toLowerCase()) {
      case 'mobile':
        return <Smartphone className="h-4 w-4" />
      case 'tablet':
        return <Tablet className="h-4 w-4" />
      case 'desktop':
        return <Monitor className="h-4 w-4" />
      default:
        return <Monitor className="h-4 w-4" />
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading domain management...</p>
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
              <div className="p-2 bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-lg">
                <Globe className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Domain Management</h1>
                <p className="text-sm text-slate-600 dark:text-slate-400">Monitor and manage deployed sites</p>
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
              <Button variant="outline" size="sm" onClick={loadDomainData} className="border-slate-200 dark:border-slate-700">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Data
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportReport} className="border-slate-200 dark:border-slate-700">
                <Download className="h-4 w-4 mr-2" />
                Export Report
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={handleConfigure} className="border-slate-200 dark:border-slate-700">
                <Settings className="h-4 w-4 mr-2" />
                Configure
              </Button>
            </div>
          </div>
        </div>
        {/* Stats Overview */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-blue-100 text-sm font-medium">Total Sites</p>
                    <p className="text-3xl font-bold">{stats.totalSites}</p>
                    <p className="text-blue-200 text-xs mt-1">
                      <Globe className="h-3 w-3 inline mr-1" />
                      {stats.activeSites} active
                    </p>
                  </div>
                  <Globe className="h-8 w-8 text-blue-200" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-100 text-sm font-medium">Total Views</p>
                    <p className="text-3xl font-bold">{stats.totalViews.toLocaleString()}</p>
                    <p className="text-green-200 text-xs mt-1">
                      <Eye className="h-3 w-3 inline mr-1" />
                      Avg {stats.avgViewsPerSite} per site
                    </p>
                  </div>
                  <Eye className="h-8 w-8 text-green-200" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-purple-100 text-sm font-medium">Top Performer</p>
                    <p className="text-3xl font-bold">
                      {stats.topPerformingSites[0]?.total_views || 0}
                    </p>
                    <p className="text-purple-200 text-xs mt-1 truncate">
                      <TrendingUp className="h-3 w-3 inline mr-1" />
                      {stats.topPerformingSites[0]?.project_slug || 'No data'}
                    </p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-purple-200" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-orange-100 text-sm font-medium">Recent Activity</p>
                    <p className="text-3xl font-bold">{stats.recentActivity.length}</p>
                    <p className="text-orange-200 text-xs mt-1">
                      <Activity className="h-3 w-3 inline mr-1" />
                      Sites viewed this week
                    </p>
                  </div>
                  <Activity className="h-8 w-8 text-orange-200" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Main Content */}
        <Tabs defaultValue="sites" className="space-y-6">
          <TabsList>
            <TabsTrigger value="sites">Sites Management</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="details">Site Details</TabsTrigger>
          </TabsList>

          {/* Sites Management Tab */}
          <TabsContent value="sites" className="space-y-6">
            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle>Site Management</CardTitle>
                <CardDescription>Search and filter hosted sites</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by slug or username..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-full sm:w-48">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sites</SelectItem>
                      <SelectItem value="active">Active Only</SelectItem>
                      <SelectItem value="inactive">Inactive Only</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="w-full sm:w-48">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="views">Most Views</SelectItem>
                      <SelectItem value="created">Recently Created</SelectItem>
                      <SelectItem value="lastViewed">Recently Viewed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Sites Table */}
            <Card>
              <CardHeader>
                <CardTitle>Sites ({filteredSites.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Site</TableHead>
                      <TableHead>Creator</TableHead>
                      <TableHead>Views</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Last Viewed</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSites.map((site) => (
                      <TableRow key={site.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{site.project_slug}</div>
                            {site.original_slug && site.original_slug !== site.project_slug && (
                              <div className="text-sm text-muted-foreground">from: {site.original_slug}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{site.auth_username}</TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-1">
                            <Eye className="h-4 w-4 text-muted-foreground" />
                            <span>{site.total_views.toLocaleString()}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={site.is_active ? "default" : "secondary"}>
                            {site.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(site.created_at)}</TableCell>
                        <TableCell>
                          {site.last_viewed_at ? formatDate(site.last_viewed_at) : "Never"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(`https://${site.project_slug}.pipilot.dev`, '_blank')}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedSite(site)
                                loadSiteDetails(site.id)
                              }}
                            >
                              <BarChart3 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant={site.is_active ? "outline" : "default"}
                              size="sm"
                              onClick={() => handleSiteAction(site.id, site.is_active ? 'deactivate' : 'activate')}
                            >
                              {site.is_active ? 'Deactivate' : 'Activate'}
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                if (confirm('Are you sure you want to delete this site? This action cannot be undone.')) {
                                  handleSiteAction(site.id, 'delete')
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Performing Sites */}
              <Card>
                <CardHeader>
                  <CardTitle>Top Performing Sites</CardTitle>
                  <CardDescription>Sites with the most views</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {stats?.topPerformingSites.slice(0, 5).map((site, index) => (
                      <div key={site.id} className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-sm font-medium">
                            {index + 1}
                          </div>
                          <div>
                            <div className="font-medium">{site.project_slug}</div>
                            <div className="text-sm text-muted-foreground">{site.auth_username}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">{site.total_views.toLocaleString()}</div>
                          <div className="text-sm text-muted-foreground">views</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Device Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle>Device Breakdown</CardTitle>
                  <CardDescription>Views by device type</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {stats && Object.entries(stats.deviceBreakdown).map(([device, count]) => (
                      <div key={device} className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          {getDeviceIcon(device)}
                          <span className="capitalize">{device}</span>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">{count.toLocaleString()}</div>
                          <div className="text-sm text-muted-foreground">
                            {((count / Object.values(stats.deviceBreakdown).reduce((a, b) => a + b, 0)) * 100).toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Activity</CardTitle>
                  <CardDescription>Sites viewed in the last 7 days</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {stats?.recentActivity.slice(0, 5).map((site) => (
                      <div key={site.id} className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{site.project_slug}</div>
                          <div className="text-sm text-muted-foreground">{site.auth_username}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-muted-foreground">
                            {site.last_viewed_at ? formatDate(site.last_viewed_at) : 'Unknown'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Country Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle>Geographic Distribution</CardTitle>
                  <CardDescription>Views by country</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {stats && Object.entries(stats.countryBreakdown)
                      .sort(([,a], [,b]) => b - a)
                      .slice(0, 5)
                      .map(([country, count]) => (
                      <div key={country} className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <Globe className="h-4 w-4 text-muted-foreground" />
                          <span>{country === 'unknown' ? 'Unknown' : country.toUpperCase()}</span>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">{count.toLocaleString()}</div>
                          <div className="text-sm text-muted-foreground">
                            {((count / Object.values(stats.countryBreakdown).reduce((a, b) => a + b, 0)) * 100).toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Site Details Tab */}
          <TabsContent value="details" className="space-y-6">
            {selectedSite ? (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Site Details: {selectedSite.project_slug}</CardTitle>
                    <CardDescription>
                      Created by {selectedSite.auth_username} on {formatDate(selectedSite.created_at)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <div className="text-sm text-muted-foreground">Total Views</div>
                        <div className="text-2xl font-bold">{selectedSite.total_views.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Status</div>
                        <Badge variant={selectedSite.is_active ? "default" : "secondary"}>
                          {selectedSite.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Last Viewed</div>
                        <div className="text-sm">
                          {selectedSite.last_viewed_at ? formatDate(selectedSite.last_viewed_at) : "Never"}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Original Slug</div>
                        <div className="text-sm">
                          {selectedSite.original_slug || selectedSite.project_slug}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Recent Views ({siteDetails.length})</CardTitle>
                    <CardDescription>Detailed view analytics for this site</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Time</TableHead>
                          <TableHead>Device</TableHead>
                          <TableHead>Country</TableHead>
                          <TableHead>Referrer</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {siteDetails.map((view) => (
                          <TableRow key={view.id}>
                            <TableCell>{formatDate(view.viewed_at)}</TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-2">
                                {getDeviceIcon(view.device_type)}
                                <span className="capitalize">{view.device_type}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {view.country ? view.country.toUpperCase() : 'Unknown'}
                            </TableCell>
                            <TableCell className="max-w-xs truncate">
                              {view.referrer || 'Direct'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">No Site Selected</h3>
                    <p className="text-muted-foreground">Select a site from the Sites Management tab to view detailed analytics.</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}