"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/use-toast"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Globe,
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  Copy,
  ExternalLink,
  RefreshCw,
  AlertCircle
} from "lucide-react"
import { usePageTitle } from '@/hooks/use-page-title'

interface CustomDomain {
  id: string
  domain: string
  site_id: string
  verified: boolean
  created_at: string
  updated_at: string
}

interface Site {
  id: string
  project_slug: string
  original_slug: string | null
}

export default function DomainsPage() {
  usePageTitle('Domain Management')
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [domains, setDomains] = useState<CustomDomain[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [newDomain, setNewDomain] = useState("")
  const [selectedSiteId, setSelectedSiteId] = useState("")
  const [addingDomain, setAddingDomain] = useState(false)
  const [verifyingDomain, setVerifyingDomain] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkAuthAndLoadData()
  }, [])

  const checkAuthAndLoadData = async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser()

      if (error || !user) {
        router.push('/auth/login')
        return
      }

      setUser(user)
      await Promise.all([
        loadDomains(user.id),
        loadSites(user.id)
      ])
    } catch (error) {
      console.error('Error loading data:', error)
      toast({
        title: "Error",
        description: "Failed to load domain data",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const loadDomains = async (userId: string) => {
    const { data, error } = await supabase
      .from('custom_domains')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error loading domains:', error)
      return
    }

    setDomains(data || [])
  }

  const loadSites = async (userId: string) => {
    // For now, we'll get sites from the sites table
    // In a real implementation, you might have a sites table or get this from your site management system
    const { data, error } = await supabase
      .from('sites') // Assuming you have a sites table
      .select('id, project_slug, original_slug')
      .eq('auth_user_id', userId)

    if (error) {
      console.error('Error loading sites:', error)
      // For demo purposes, let's create some mock sites
      setSites([
        { id: 'code-craft-studio-btq', project_slug: 'code-craft-studio-btq', original_slug: null },
        { id: 'code-canvas-lab-bp7', project_slug: 'code-canvas-lab-bp7', original_slug: null }
      ])
      return
    }

    setSites(data || [])
  }

  const addDomain = async () => {
    if (!newDomain.trim() || !selectedSiteId) {
      toast({
        title: "Validation Error",
        description: "Please enter a domain and select a site",
        variant: "destructive"
      })
      return
    }

    // Basic domain validation
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
    if (!domainRegex.test(newDomain)) {
      toast({
        title: "Invalid Domain",
        description: "Please enter a valid domain name",
        variant: "destructive"
      })
      return
    }

    setAddingDomain(true)

    try {
      // Add domain via our API
      const response = await fetch(`/api/sites/${selectedSiteId}/domains`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          domain: newDomain,
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to add domain')
      }

      const data = await response.json()

      // Update local state
      setDomains([data.domain, ...domains])
      setNewDomain("")
      setSelectedSiteId("")

      toast({
        title: "Domain Added",
        description: data.domain.verified
          ? "Domain added and verified successfully!"
          : "Domain added! Please configure DNS records to complete verification.",
      })

      // Show DNS instructions if not verified
      if (!data.domain.verified && data.dnsInstructions.length > 0) {
        // You could show a modal or expand a section with DNS instructions
        console.log('DNS Instructions:', data.dnsInstructions)
      }

    } catch (error: any) {
      console.error('Error adding domain:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to add domain",
        variant: "destructive"
      })
    } finally {
      setAddingDomain(false)
    }
  }

  const verifyDomain = async (domainId: string, domainName: string) => {
    setVerifyingDomain(domainId)

    try {
      const response = await fetch(`/api/sites/${domains.find(d => d.id === domainId)?.site_id}/domains/${domainId}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to verify domain')
      }

      const data = await response.json()

      // Update local state
      setDomains(domains.map(d =>
        d.id === domainId
          ? { ...d, verified: data.verified, updated_at: new Date().toISOString() }
          : d
      ))

      toast({
        title: data.verified ? "Domain Verified!" : "Verification Pending",
        description: data.verified
          ? "Your domain is now active and ready to use."
          : "DNS propagation may take 24-48 hours. Try again later.",
      })

    } catch (error: any) {
      console.error('Error verifying domain:', error)
      toast({
        title: "Verification Failed",
        description: error.message || "Failed to verify domain",
        variant: "destructive"
      })
    } finally {
      setVerifyingDomain(null)
    }
  }

  const deleteDomain = async (domainId: string, domainName: string) => {
    if (!confirm(`Are you sure you want to delete the domain ${domainName}?`)) {
      return
    }

    try {
      const siteId = domains.find(d => d.id === domainId)?.site_id
      const response = await fetch(`/api/sites/${siteId}/domains/${domainId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        }
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete domain')
      }

      // Update local state
      setDomains(domains.filter(d => d.id !== domainId))

      toast({
        title: "Domain Deleted",
        description: "Domain has been removed successfully",
      })

    } catch (error: any) {
      console.error('Error deleting domain:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to delete domain",
        variant: "destructive"
      })
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast({
      title: "Copied!",
      description: "Text copied to clipboard",
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Custom Domains</h1>
            <p className="text-gray-600 mt-2">
              Connect your own domains to your hosted sites
            </p>
          </div>
        </div>

        {/* Add Domain Card */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add Custom Domain
            </CardTitle>
            <CardDescription>
              Connect a custom domain to one of your sites
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Input
                placeholder="example.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                className="flex-1"
              />
              <select
                value={selectedSiteId}
                onChange={(e) => setSelectedSiteId(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a site</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.project_slug}
                  </option>
                ))}
              </select>
              <Button
                onClick={addDomain}
                disabled={addingDomain}
                className="px-6"
              >
                {addingDomain ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Domain
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Domains List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Your Domains
            </CardTitle>
            <CardDescription>
              Manage your custom domains and their verification status
            </CardDescription>
          </CardHeader>
          <CardContent>
            {domains.length === 0 ? (
              <div className="text-center py-8">
                <Globe className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No custom domains yet
                </h3>
                <p className="text-gray-600">
                  Add your first custom domain to get started
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Domain</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {domains.map((domain) => (
                    <TableRow key={domain.id}>
                      <TableCell className="font-medium">
                        {domain.domain}
                      </TableCell>
                      <TableCell>
                        {sites.find(s => s.id === domain.site_id)?.project_slug || domain.site_id}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={domain.verified ? "default" : "secondary"}
                          className={domain.verified ? "bg-green-100 text-green-800" : ""}
                        >
                          {domain.verified ? (
                            <>
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Verified
                            </>
                          ) : (
                            <>
                              <Clock className="h-3 w-3 mr-1" />
                              Pending
                            </>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(domain.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {!domain.verified && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => verifyDomain(domain.id, domain.domain)}
                              disabled={verifyingDomain === domain.id}
                            >
                              {verifyingDomain === domain.id ? (
                                <RefreshCw className="h-3 w-3 animate-spin" />
                              ) : (
                                "Verify"
                              )}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => deleteDomain(domain.id, domain.domain)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* DNS Instructions Alert */}
        {domains.some(d => !d.verified) && (
          <Alert className="mt-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>DNS Configuration Required:</strong> Some domains need DNS records configured.
              After adding a domain, you'll receive specific DNS instructions. DNS changes can take 24-48 hours to propagate.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  )
}