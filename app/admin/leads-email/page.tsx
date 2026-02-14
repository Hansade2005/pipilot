"use client"

import React, { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { checkAdminAccess } from "@/lib/admin-utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import {
  Mail,
  Sparkles,
  Search,
  Filter,
  Users,
  ArrowLeft,
  Loader2,
  Check,
  Clock
} from "lucide-react"
import { Lead, getLeadsSync } from "@/lib/leads-parser"
import { EmailComposeModal } from "@/components/email-compose-modal"
import { usePageTitle } from '@/hooks/use-page-title'

export default function LeadsEmailPage() {
  usePageTitle('Leads Email')
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [leads, setLeads] = useState<Lead[]>([])
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [segmentFilter, setSegmentFilter] = useState<string>("all")
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [emailTracking, setEmailTracking] = useState<Map<string, { times_sent: number; last_sent_at: string | null }>>(new Map())

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const supabase = createClient()
      const { data: { user }, error } = await supabase.auth.getUser()

      if (error || !user) {
        router.push('/auth/login')
        return
      }

      if (!checkAdminAccess(user)) {
        toast({
          title: "Access denied",
          description: "You must be an admin to access this page",
          variant: "destructive"
        })
        router.push("/")
        return
      }

      await loadLeads()
      await loadEmailTracking()
    } catch (error) {
      console.error('Error checking admin access:', error)
      router.push('/workspace')
    } finally {
      setLoading(false)
    }
  }

  const loadLeads = async () => {
    try {
      const response = await fetch('/leads.md')
      const markdown = await response.text()
      const parsedLeads = getLeadsSync(markdown)
      setLeads(parsedLeads)
      setFilteredLeads(parsedLeads)
      console.log(`📋 Loaded ${parsedLeads.length} leads`)
    } catch (error) {
      console.error('Error loading leads:', error)
      toast({
        title: "Error loading leads",
        description: "Failed to load leads data",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const loadEmailTracking = async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('leads_email_tracking')
        .select('lead_email, times_sent, last_sent_at')

      if (error) throw error

      const trackingMap = new Map()
      data?.forEach((record: any) => {
        trackingMap.set(record.lead_email, {
          times_sent: record.times_sent,
          last_sent_at: record.last_sent_at
        })
      })
      setEmailTracking(trackingMap)
    } catch (error) {
      console.error('Error loading email tracking:', error)
    }
  }

  // Filter leads
  useEffect(() => {
    let filtered = leads

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(lead =>
        lead.name.toLowerCase().includes(query) ||
        lead.email.toLowerCase().includes(query) ||
        lead.context.toLowerCase().includes(query) ||
        lead.company?.toLowerCase().includes(query)
      )
    }

    // Filter by segment
    if (segmentFilter !== "all") {
      filtered = filtered.filter(lead => lead.segment === segmentFilter)
    }

    setFilteredLeads(filtered)
  }, [searchQuery, segmentFilter, leads])

  const getSegmentColor = (segment: string) => {
    const colors: Record<string, string> = {
      investor: "bg-blue-500",
      creator: "bg-purple-500",
      partner: "bg-green-500",
      user: "bg-red-500",
      other: "bg-gray-500"
    }
    return colors[segment] || colors.other
  }

  const getSegmentStats = () => {
    const stats = {
      investor: 0,
      creator: 0,
      partner: 0,
      user: 0,
      other: 0
    }
    leads.forEach(lead => {
      stats[lead.segment]++
    })
    return stats
  }

  const stats = getSegmentStats()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              onClick={() => router.push("/admin")}
              variant="ghost"
              size="icon"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Mail className="h-8 w-8 text-primary" />
                Leads Email Manager
              </h1>
              <p className="text-muted-foreground">
                Send AI-powered personalized emails to {leads.length} leads
              </p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Leads
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{leads.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-blue-500" />
                Investors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.investor}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-purple-500" />
                Creators
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.creator}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-green-500" />
                Partners
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.partner}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-red-500" />
                Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.user}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, context, or company..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={segmentFilter} onValueChange={setSegmentFilter}>
                <SelectTrigger className="w-[200px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter by segment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Segments</SelectItem>
                  <SelectItem value="investor">Investors</SelectItem>
                  <SelectItem value="creator">Creators</SelectItem>
                  <SelectItem value="partner">Partners</SelectItem>
                  <SelectItem value="user">Users</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              Showing {filteredLeads.length} of {leads.length} leads
            </p>
          </CardContent>
        </Card>

        {/* Leads Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[600px]">
              <table className="w-full">
                <thead className="bg-muted/50 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium">Name</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Email</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Segment</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Context</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
                    <th className="px-4 py-3 text-right text-sm font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredLeads.map((lead, index) => {
                    const tracking = emailTracking.get(lead.email)
                    const hasSent = tracking && tracking.times_sent > 0

                    return (
                      <tr
                        key={index}
                        className="hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div>
                            <div className="font-medium">{lead.name}</div>
                            {lead.company && (
                              <div className="text-xs text-muted-foreground">
                                {lead.company}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {lead.email}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant="secondary"
                            className={`${getSegmentColor(lead.segment)} text-white`}
                          >
                            {lead.segment}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm max-w-xs truncate">
                          {lead.context}
                        </td>
                        <td className="px-4 py-3">
                          {hasSent ? (
                            <div className="flex items-center gap-2 text-sm">
                              <Check className="h-4 w-4 text-green-500" />
                              <span className="text-green-600 dark:text-green-400">
                                Sent {tracking.times_sent}x
                              </span>
                              {tracking.last_sent_at && (
                                <span className="text-xs text-muted-foreground">
                                  {new Date(tracking.last_sent_at).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Clock className="h-4 w-4" />
                              Not contacted
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            onClick={() => setSelectedLead(lead)}
                            size="sm"
                            variant={hasSent ? "outline" : "default"}
                          >
                            <Sparkles className="h-4 w-4 mr-2" />
                            Compose
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Email Compose Modal */}
      {selectedLead && (
        <EmailComposeModal
          open={!!selectedLead}
          onClose={() => {
            setSelectedLead(null)
            loadEmailTracking() // Refresh tracking data
          }}
          lead={selectedLead}
        />
      )}
    </div>
  )
}
