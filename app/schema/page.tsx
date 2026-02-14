"use client"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { SchemaVisualizer } from "@/components/schema-visualizer"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Database, Eye, GitBranch } from "lucide-react"
import { usePageTitle } from '@/hooks/use-page-title'

export default function SchemaVisualizerPage() {
  usePageTitle('Schema')
  return (
    <div className="flex flex-col min-h-screen">
      <Navigation />
      
      <main className="flex-1 pt-20">
        {/* Header */}
        <div className="border-b bg-gradient-to-br from-blue-500/5 to-cyan-500/5">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30 flex items-center justify-center">
                <Database className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <h1 className="text-4xl font-bold">Schema Visualizer</h1>
                <p className="text-muted-foreground mt-1">Explore your database structure visually</p>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-3 mt-6">
              <Badge variant="outline" className="bg-blue-500/10 border-blue-500/30">
                <Eye className="h-3 w-3 mr-1" />
                Visual Explorer
              </Badge>
              <Badge variant="outline" className="bg-green-500/10 border-green-500/30">
                <GitBranch className="h-3 w-3 mr-1" />
                Relationship Mapping
              </Badge>
              <Badge variant="outline" className="bg-purple-500/10 border-purple-500/30">
                <Database className="h-3 w-3 mr-1" />
                ER Diagrams
              </Badge>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="mb-8">
            <Card className="bg-blue-500/10 border-blue-500/30">
              <CardHeader>
                <CardTitle className="text-lg">Database Schema Overview</CardTitle>
                <CardDescription>
                  Visualize your database structure with interactive tables, columns, and relationship diagrams. 
                  Understand how your data is connected and explore entity relationships with ease.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>

          <SchemaVisualizer />
        </div>
      </main>

      <Footer />
    </div>
  )
}
