"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/components/ui/use-toast"
import { Globe, Plus, ExternalLink, Settings } from "lucide-react"
import { usePageTitle } from '@/hooks/use-page-title'

export default function SitesManagePage() {
  usePageTitle('Manage Sites')
  const router = useRouter()
  const [sites, setSites] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // For now, show some example sites
    // In a real app, you'd fetch sites from your database
    const exampleSites = [
      {
        id: "demo-site",
        name: "Demo Site",
        subdomain: "demo-site.pipilot.dev",
        createdAt: new Date().toISOString(),
        status: "active"
      },
      {
        id: "portfolio",
        name: "Portfolio",
        subdomain: "portfolio.pipilot.dev",
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        status: "active"
      },
      {
        id: "blog",
        name: "Blog",
        subdomain: "blog.pipilot.dev",
        createdAt: new Date(Date.now() - 172800000).toISOString(),
        status: "active"
      }
    ]
    setSites(exampleSites)
    setLoading(false)
  }, [])

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
          <h1 className="text-3xl font-bold">Your Sites</h1>
          <p className="text-muted-foreground">
            Manage your hosted sites and custom domains
          </p>
        </div>
        <Button disabled>
          <Plus className="w-4 h-4 mr-2" />
          New Site
          <span className="text-xs text-muted-foreground ml-2">(Coming Soon)</span>
        </Button>
      </div>

      {sites.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Globe className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No sites yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Create your first site to get started with custom domain hosting
            </p>
            <Button disabled>
              <Plus className="w-4 h-4 mr-2" />
              Create Site
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {sites.map((site) => (
            <Card key={site.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center">
                      {site.name}
                      <Badge variant="secondary" className="ml-2">
                        {site.status}
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      Site ID: {site.id}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(`https://${site.subdomain}`, '_blank')}
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      Visit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/sites/${site.id}`)}
                    >
                      <Settings className="w-3 h-3 mr-1" />
                      Manage
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div>
                    <label className="text-sm font-medium">Default Domain</label>
                    <p className="text-sm text-muted-foreground font-mono">
                      {site.subdomain}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Created</label>
                    <p className="text-sm text-muted-foreground">
                      {new Date(site.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Info Card */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Custom Domain Hosting</CardTitle>
          <CardDescription>
            Connect your own domains to any of your sites for a professional appearance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <Globe className="w-8 h-8 mx-auto mb-2 text-primary" />
              <h4 className="font-semibold">Free Domains</h4>
              <p className="text-sm text-muted-foreground">
                Unlimited custom domains at no extra cost
              </p>
            </div>
            <div className="text-center">
              <Settings className="w-8 h-8 mx-auto mb-2 text-primary" />
              <h4 className="font-semibold">Easy Setup</h4>
              <p className="text-sm text-muted-foreground">
                Simple DNS configuration with clear instructions
              </p>
            </div>
            <div className="text-center">
              <ExternalLink className="w-8 h-8 mx-auto mb-2 text-primary" />
              <h4 className="font-semibold">SSL Included</h4>
              <p className="text-sm text-muted-foreground">
                Automatic HTTPS certificates for all domains
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}