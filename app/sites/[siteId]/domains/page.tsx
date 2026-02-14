"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/use-toast"
import { AlertCircle, CheckCircle, Clock, ExternalLink, Plus, RefreshCw, Trash2, Globe } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { usePageTitle } from '@/hooks/use-page-title'

interface CustomDomain {
  id: string
  domain: string
  site_id: string
  verified: boolean
  created_at: string
  updated_at: string
  dnsInstructions?: Array<{
    type: string
    name: string
    value: string
    reason?: string
  }>
}

export default function SiteDomainsPage() {
  usePageTitle('Site Domains')
  const params = useParams()
  const router = useRouter()
  const siteId = params.siteId as string

  const [domains, setDomains] = useState<CustomDomain[]>([])
  const [loading, setLoading] = useState(true)
  const [addingDomain, setAddingDomain] = useState(false)
  const [newDomain, setNewDomain] = useState("")
  const [verifyingDomain, setVerifyingDomain] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    loadDomains()
  }, [siteId])

  const loadDomains = async () => {
    try {
      const response = await fetch(`/api/sites/${siteId}/domains`)
      if (response.ok) {
        const data = await response.json()
        setDomains(data.domains || [])
      } else {
        toast({
          title: "Error",
          description: "Failed to load domains",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error loading domains:", error)
      toast({
        title: "Error",
        description: "Failed to load domains",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const addDomain = async () => {
    if (!newDomain.trim()) {
      toast({
        title: "Error",
        description: "Please enter a domain name",
        variant: "destructive",
      })
      return
    }

    // Basic domain validation
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
    if (!domainRegex.test(newDomain)) {
      toast({
        title: "Error",
        description: "Please enter a valid domain name",
        variant: "destructive",
      })
      return
    }

    setAddingDomain(true)
    try {
      const response = await fetch(`/api/sites/${siteId}/domains`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ domain: newDomain.trim() }),
      })

      if (response.ok) {
        const data = await response.json()
        toast({
          title: "Domain Added",
          description: data.message || `Domain ${newDomain} has been added to Vercel. Configure your DNS records to complete setup.`,
        })
        setNewDomain("")
        loadDomains()
      } else {
        const error = await response.json()
        toast({
          title: "Error",
          description: error.error || "Failed to add domain",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error adding domain:", error)
      toast({
        title: "Error",
        description: "Failed to add domain",
        variant: "destructive",
      })
    } finally {
      setAddingDomain(false)
    }
  }

  const verifyDomain = async (domainId: string) => {
    setVerifyingDomain(domainId)
    try {
      const response = await fetch(`/api/sites/${siteId}/domains/${domainId}/verify`, {
        method: "POST",
      })

      if (response.ok) {
        toast({
          title: "Verification Check",
          description: "Domain verification status has been updated.",
        })
        loadDomains()
      } else {
        const error = await response.json()
        toast({
          title: "Error",
          description: error.error || "Failed to verify domain",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error verifying domain:", error)
      toast({
        title: "Error",
        description: "Failed to verify domain",
        variant: "destructive",
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
      const response = await fetch(`/api/sites/${siteId}/domains/${domainId}`, {
        method: "DELETE",
      })

      if (response.ok) {
        toast({
          title: "Domain Deleted",
          description: `Domain ${domainName} has been removed.`,
        })
        loadDomains()
      } else {
        const error = await response.json()
        toast({
          title: "Error",
          description: error.error || "Failed to delete domain",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error deleting domain:", error)
      toast({
        title: "Error",
        description: "Failed to delete domain",
        variant: "destructive",
      })
    }
  }

  const getStatusBadge = (domain: CustomDomain) => {
    if (domain.verified) {
      return (
        <Badge variant="default" className="bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3 mr-1" />
          Verified
        </Badge>
      )
    } else {
      return (
        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
          <Clock className="w-3 h-3 mr-1" />
          Pending
        </Badge>
      )
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center">
          <RefreshCw className="w-6 h-6 animate-spin" />
          <span className="ml-2">Loading domains...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Custom Domains</h1>
          <p className="text-muted-foreground">
            Connect your own domains to this site
          </p>
        </div>
        <Button onClick={() => router.push(`/sites/${siteId}`)}>
          Back to Site
        </Button>
      </div>

      <div className="grid gap-6">
        {/* Add Domain Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Plus className="w-5 h-5 mr-2" />
              Add Custom Domain
            </CardTitle>
            <CardDescription>
              Connect your own domain to this site. You'll need to configure DNS records.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Input
                placeholder="example.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && addDomain()}
              />
              <Button
                onClick={addDomain}
                disabled={addingDomain}
              >
                {addingDomain ? (
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Add Domain
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Domains List */}
        <Card>
          <CardHeader>
            <CardTitle>Your Domains</CardTitle>
            <CardDescription>
              Manage your custom domains for this site
            </CardDescription>
          </CardHeader>
          <CardContent>
            {domains.length === 0 ? (
              <div className="text-center py-8">
                <Globe className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No custom domains yet</h3>
                <p className="text-muted-foreground">
                  Add your first custom domain to get started
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Domain</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {domains.map((domain) => (
                    <TableRow key={domain.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center">
                          <Globe className="w-4 h-4 mr-2 text-muted-foreground" />
                          {domain.domain}
                          {domain.verified && (
                            <ExternalLink
                              className="w-4 h-4 ml-2 text-green-600 cursor-pointer"
                              onClick={() => window.open(`https://${domain.domain}`, '_blank')}
                            />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(domain)}</TableCell>
                      <TableCell>
                        {new Date(domain.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {!domain.verified && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => verifyDomain(domain.id)}
                              disabled={verifyingDomain === domain.id}
                            >
                              {verifyingDomain === domain.id ? (
                                <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                              ) : (
                                <RefreshCw className="w-3 h-3 mr-1" />
                              )}
                              Verify
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deleteDomain(domain.id, domain.domain)}
                          >
                            <Trash2 className="w-3 h-3" />
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

        {/* DNS Instructions */}
        {domains.some(d => !d.verified) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <AlertCircle className="w-5 h-5 mr-2" />
                DNS Configuration Required
              </CardTitle>
              <CardDescription>
                Configure these DNS records at your domain registrar to verify ownership and enable your custom domain.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {domains
                  .filter(d => !d.verified)
                  .map(domain => (
                    <div key={domain.id} className="border rounded-lg p-4">
                      <h4 className="font-medium mb-3">DNS Records for {domain.domain}</h4>
                      <div className="space-y-2">
                        <div className="grid grid-cols-4 gap-2 text-sm font-mono bg-muted p-3 rounded">
                          <div className="font-medium">Type</div>
                          <div className="font-medium">Name</div>
                          <div className="font-medium col-span-2">Value</div>
                        </div>
                        {domain.dnsInstructions && domain.dnsInstructions.length > 0 ? (
                          domain.dnsInstructions.map((record: any, index: number) => (
                            <div key={index} className="grid grid-cols-4 gap-2 text-sm font-mono bg-muted/50 p-3 rounded">
                              <div>{record.type || 'A'}</div>
                              <div>{record.name || '@'}</div>
                              <div className="col-span-2">{record.value || '216.198.79.1'}</div>
                            </div>
                          ))
                        ) : (
                          <>
                            <div className="grid grid-cols-4 gap-2 text-sm font-mono bg-muted/50 p-3 rounded">
                              <div>A</div>
                              <div>@</div>
                              <div className="col-span-2">216.198.79.1</div>
                            </div>
                            <div className="grid grid-cols-4 gap-2 text-sm font-mono bg-muted/50 p-3 rounded">
                              <div>CNAME</div>
                              <div>www</div>
                              <div className="col-span-2">cname.vercel-dns.com</div>
                            </div>
                          </>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-3">
                        DNS changes can take 24-48 hours to propagate. Click "Verify" after adding the records.
                      </p>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}