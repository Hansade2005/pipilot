"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/components/ui/use-toast"
import { Globe, ExternalLink, Settings, ArrowLeft } from "lucide-react"
import { usePageTitle } from '@/hooks/use-page-title'

export default function SitePage() {
  usePageTitle('Site Details')
  const params = useParams()
  const router = useRouter()
  const siteId = params.siteId as string

  const [siteInfo, setSiteInfo] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // For now, just show basic site info
    // In a real app, you'd fetch site details from your database
    setSiteInfo({
      id: siteId,
      name: siteId,
      subdomain: `${siteId}.pipilot.dev`,
      createdAt: new Date().toISOString(),
    })
    setLoading(false)
  }, [siteId])

  if (loading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <Button
            variant="ghost"
            onClick={() => router.push('/sites')}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Sites
          </Button>
          <h1 className="text-3xl font-bold">Site: {siteInfo.name}</h1>
          <p className="text-muted-foreground">
            Manage your site settings and custom domains
          </p>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Site Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Globe className="w-5 h-5 mr-2" />
              Site Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Site ID</label>
                <p className="text-sm text-muted-foreground font-mono">{siteInfo.id}</p>
              </div>
              <div>
                <label className="text-sm font-medium">Default Domain</label>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground">{siteInfo.subdomain}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`https://${siteInfo.subdomain}`, '_blank')}
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Visit
                  </Button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Created</label>
                <p className="text-sm text-muted-foreground">
                  {new Date(siteInfo.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Custom Domains Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Settings className="w-5 h-5 mr-2" />
              Custom Domains
            </CardTitle>
            <CardDescription>
              Connect your own domains to this site for a professional appearance
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-2">
                  Add custom domains like yoursite.com or blog.yoursite.com
                </p>
                <Badge variant="secondary">Free for all users</Badge>
              </div>
              <Button onClick={() => router.push(`/sites/${siteId}/domains`)}>
                Manage Domains
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button
                variant="outline"
                className="h-20 flex-col"
                onClick={() => window.open(`https://${siteInfo.subdomain}`, '_blank')}
              >
                <ExternalLink className="w-5 h-5 mb-2" />
                Visit Site
              </Button>
              <Button
                variant="outline"
                className="h-20 flex-col"
                onClick={() => router.push(`/sites/${siteId}/domains`)}
              >
                <Globe className="w-5 h-5 mb-2" />
                Custom Domains
              </Button>
              <Button
                variant="outline"
                className="h-20 flex-col"
                disabled
              >
                <Settings className="w-5 h-5 mb-2" />
                Site Settings
                <span className="text-xs text-muted-foreground mt-1">Coming Soon</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}