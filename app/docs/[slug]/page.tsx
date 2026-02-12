"use client"

import { Logo } from "@/components/ui/logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BookOpen, ArrowLeft, Clock, Calendar, Tag, ChevronRight, ExternalLink, Share2, Bookmark } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { usePageTitle } from '@/hooks/use-page-title'

interface DocSection {
  title: string
  content: string
  search_keywords: string[]
  overview: string
}

export default function DocPage() {
  usePageTitle('Documentation')
  const params = useParams()
  const router = useRouter()
  const [docData, setDocData] = useState<DocSection | null>(null)
  const [allSections, setAllSections] = useState<DocSection[]>([])
  const [relatedDocs, setRelatedDocs] = useState<DocSection[]>([])
  const [loading, setLoading] = useState(true)
  const [readingProgress, setReadingProgress] = useState(0)

  // Parse content into structured sections
  const parseContentIntoSections = (content: string, title: string) => {
    // Check if this is MCP documentation
    const isMCPDoc = title.toLowerCase().includes('mcp server')

    if (isMCPDoc) {
      return parseMCPContent(content)
    }

    // Generic parser for other docs
    const sections = [
      {
        heading: "Overview",
        body: content,
        key_points: [],
        technical_highlights: [],
        benefits: []
      }
    ]

    return sections.map((section, index) => renderContentSection(section, index))
  }

  // MCP-specific content parser
  const parseMCPContent = (content: string) => {
    const sections = []

    // Extract key sections from the content
    const overviewMatch = content.match(/PiPilot's MCP[\s\S]*?(?=The MCP server|Setting up|Security features|$)/)
    const setupMatch = content.match(/Setting up MCP integration[\s\S]*?(?=Multiple AI assistants|Security features|$)/)
    const securityMatch = content.match(/Security features include[\s\S]*?(?=Rate limiting|Error handling|$)/)
    const toolsMatch = content.match(/The MCP server supports all major database operations[\s\S]*?(?=Security features|Performance|$)/)

    // Overview Section
    if (overviewMatch) {
      sections.push({
        heading: "Overview",
        body: overviewMatch[0].trim(),
        isCode: false
      })
    }

    // Setup Section with code examples
    sections.push({
      heading: "Setup & Configuration",
      body: "Configure the MCP server in your AI assistant to enable natural language database operations. The hosted server handles all authentication and security automatically.",
      isCode: false,
      codeBlocks: [
        {
          title: "VS Code / Cursor / Windsurf",
          language: "json",
          code: `{
  "mcp": {
    "servers": {
      "pipilot": {
        "type": "http",
        "url": "https://pipilot-mcp-server.vercel.app/mcp",
        "headers": {
          "Authorization": "Bearer your-api-key",
          "X-Database-ID": "your-database-id"
        }
      }
    }
  }
}`
        },
        {
          title: "Claude Desktop",
          language: "json",
          code: `{
  "mcpServers": {
    "pipilot": {
      "type": "http",
      "url": "https://pipilot-mcp-server.vercel.app/mcp",
      "headers": {
        "Authorization": "Bearer your-api-key",
        "X-Database-ID": "your-database-id"
      }
    }
  }
}`
        }
      ]
    })

    // Available Tools Section
    sections.push({
      heading: "Available Tools (17 Total)",
      body: "The MCP server provides comprehensive database operations through natural language:",
      isCode: false,
      toolCategories: [
        {
          category: "Database Operations",
          tools: [
            { name: "pipilot_list_tables", desc: "List all tables with schema info" },
            { name: "pipilot_read_table", desc: "Get detailed table information" },
            { name: "pipilot_fetch_records", desc: "Fetch records with pagination" },
            { name: "pipilot_query_table", desc: "Advanced queries with filtering & sorting" },
            { name: "pipilot_insert_record", desc: "Insert new records" },
            { name: "pipilot_update_record", desc: "Update existing records" },
            { name: "pipilot_delete_record", desc: "Delete records" },
            { name: "pipilot_create_table", desc: "Create new tables" },
            { name: "pipilot_delete_table", desc: "Delete tables" }
          ]
        },
        {
          category: "Authentication",
          tools: [
            { name: "pipilot_auth_signup", desc: "Create user accounts" },
            { name: "pipilot_auth_login", desc: "User login" },
            { name: "pipilot_auth_verify", desc: "Verify tokens" }
          ]
        },
        {
          category: "Utilities",
          tools: [
            { name: "pipilot_search_docs", desc: "Search documentation" },
            { name: "pipilot_create_api_key", desc: "Create new API keys" },
            { name: "pipilot_list_api_keys", desc: "List all API keys" },
            { name: "pipilot_delete_api_key", desc: "Delete API keys" },
            { name: "pipilot_get_rate_limit_status", desc: "Check API usage limits" }
          ]
        }
      ]
    })

    // Security Section
    sections.push({
      heading: "Security & Features",
      body: "Enterprise-grade security and performance built-in:",
      isCode: false,
      features: [
        { icon: "🔐", title: "API Key Authentication", desc: "Secure authentication with API keys" },
        { icon: "🛡️", title: "Row-Level Security", desc: "Granular access control on data" },
        { icon: "⚡", title: "Rate Limiting", desc: "10,000 requests/hour with auto-retry" },
        { icon: "🔄", title: "Real-Time Updates", desc: "Live database change notifications" },
        { icon: "📊", title: "Audit Logging", desc: "Comprehensive operation tracking" },
        { icon: "🚀", title: "Auto-Scaling", desc: "Handles growing workloads automatically" }
      ]
    })

    return sections.map((section, index) => renderMCPSection(section, index))
  }

  useEffect(() => {
    const loadDocData = async () => {
      try {
        const response = await fetch('/docs.json')
        const data = await response.json()
        const slug = params.slug as string

        // Find the section by matching slugified title
        const foundSection = data.sections.find((section: DocSection) => {
          const sectionSlug = section.title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/--+/g, '-')
          return sectionSlug === slug
        })

        if (foundSection) {
          setDocData(foundSection)
          setAllSections(data.sections)

          // Get related docs (next 3 sections)
          const currentIndex = data.sections.findIndex((section: DocSection) => section === foundSection)
          const related = data.sections
            .slice(currentIndex + 1, currentIndex + 4)
            .concat(data.sections.slice(0, Math.max(0, currentIndex + 4 - data.sections.length)))
            .filter((section: DocSection) => section !== foundSection)
            .slice(0, 3)
          setRelatedDocs(related)
        } else {
          router.push('/docs')
        }
      } catch (error) {
        console.error('Failed to load documentation:', error)
        router.push('/docs')
      } finally {
        setLoading(false)
      }
    }

    if (params.slug) {
      loadDocData()
    }
  }, [params.slug, router])

  // Reading progress tracking
  useEffect(() => {
    const updateReadingProgress = () => {
      const scrollTop = window.scrollY
      const docHeight = document.documentElement.scrollHeight - window.innerHeight
      const progress = (scrollTop / docHeight) * 100
      setReadingProgress(progress)
    }

    window.addEventListener('scroll', updateReadingProgress)
    return () => window.removeEventListener('scroll', updateReadingProgress)
  }, [])

  // MCP-specific section renderer
  const renderMCPSection = (section: any, index: number) => {
    if (!section) return null

    return (
      <div key={index} id={`section-${index}`} className="mb-12">
        <div className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-2xl p-8 border border-blue-500/20">
          <h2 className="text-2xl font-bold text-white mb-6">{section.heading}</h2>

          {section.body && (
            <p className="text-gray-300 leading-relaxed text-lg mb-6">
              {section.body}
            </p>
          )}

          {/* Code Blocks for Configuration */}
          {section.codeBlocks && section.codeBlocks.length > 0 && (
            <div className="space-y-4 mb-6">
              {section.codeBlocks.map((block: any, blockIndex: number) => (
                <div key={blockIndex} className="bg-gray-900/50 rounded-lg border border-gray-700/50 overflow-hidden">
                  <div className="bg-gray-800/50 px-4 py-2 border-b border-gray-700/50">
                    <span className="text-sm font-medium text-blue-300">{block.title}</span>
                  </div>
                  <pre className="p-4 overflow-x-auto">
                    <code className="text-sm text-gray-300 font-mono">
                      {block.code}
                    </code>
                  </pre>
                </div>
              ))}
            </div>
          )}

          {/* Tool Categories */}
          {section.toolCategories && section.toolCategories.length > 0 && (
            <div className="space-y-6">
              {section.toolCategories.map((category: any, catIndex: number) => (
                <div key={catIndex}>
                  <h3 className="text-lg font-semibold text-blue-300 mb-3">{category.category}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {category.tools.map((tool: any, toolIndex: number) => (
                      <div key={toolIndex} className="bg-gray-800/30 rounded-lg p-4 border border-gray-700/30 hover:border-blue-500/30 transition-colors">
                        <code className="text-sm font-mono text-blue-400">{tool.name}</code>
                        <p className="text-xs text-gray-400 mt-1">{tool.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Feature Cards */}
          {section.features && section.features.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {section.features.map((feature: any, featureIndex: number) => (
                <div key={featureIndex} className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded-lg p-4 border border-blue-500/20">
                  <div className="text-2xl mb-2">{feature.icon}</div>
                  <h4 className="text-sm font-semibold text-white mb-1">{feature.title}</h4>
                  <p className="text-xs text-gray-400">{feature.desc}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderContentSection = (section: any, index: number) => {
    if (!section) return null

    return (
      <div key={index} id={`section-${index}`} className="mb-12">
        <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-2xl p-8 border border-purple-500/20">
          <h2 className="text-2xl font-bold text-white mb-6">{section.heading}</h2>
          <div className="prose prose-invert max-w-none">
            <p className="text-gray-300 leading-relaxed text-lg mb-6">
              {section.body}
            </p>

            {section.key_points && section.key_points.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white mb-3">Key Points</h3>
                <ul className="space-y-2">
                  {section.key_points.map((point: string, pointIndex: number) => (
                    <li key={pointIndex} className="flex items-start space-x-2">
                      <ChevronRight className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-300">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {section.technical_highlights && section.technical_highlights.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white mb-3">Technical Highlights</h3>
                <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
                  {section.technical_highlights.map((highlight: string, highlightIndex: number) => (
                    <div key={highlightIndex} className="flex items-start space-x-2 mb-2 last:mb-0">
                      <div className="w-2 h-2 rounded-full bg-purple-400 mt-2 flex-shrink-0"></div>
                      <span className="text-gray-300">{highlight}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {section.benefits && section.benefits.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white mb-3">Benefits</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(Array.isArray(section.benefits)
                    ? section.benefits
                    : section.benefits.split(', ')
                  ).map((benefit: string, benefitIndex: number) => (
                    <div key={benefitIndex} className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                      <span className="text-green-300">{benefit.trim()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {section.case_study && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white mb-3">Case Study</h3>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-6">
                  <h4 className="text-blue-300 font-medium mb-2">{section.case_study.title}</h4>
                  <p className="text-gray-300 mb-4">{section.case_study.scenario}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <h5 className="text-red-300 mb-1">Traditional Approach</h5>
                      <p className="text-gray-400">{section.case_study.traditional_approach}</p>
                    </div>
                    <div>
                      <h5 className="text-green-300 mb-1">PiPilot Approach</h5>
                      <p className="text-gray-400">{section.case_study.pilot_approach}</p>
                    </div>
                  </div>
                  <p className="text-green-300 mt-4 font-medium">{section.case_study.results}</p>
                </div>
              </div>
            )}

            {section.implementation_framework && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white mb-3">Implementation Framework</h3>
                <div className="space-y-3">
                  {Object.entries(section.implementation_framework).map(([phase, description]: [string, any], phaseIndex: number) => (
                    <div key={phaseIndex} className="flex gap-3">
                      <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 flex-shrink-0">
                        {phase.replace('_', ' ')}
                      </Badge>
                      <span className="text-gray-300">{description}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {section.code_comparison && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white mb-3">Code Comparison</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                    <h4 className="text-red-300 font-medium mb-2">Traditional</h4>
                    <pre className="text-xs text-gray-300 overflow-x-auto">
                      <code>{section.code_comparison.traditional}</code>
                    </pre>
                  </div>
                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                    <h4 className="text-green-300 font-medium mb-2">PiPilot</h4>
                    <pre className="text-xs text-gray-300 overflow-x-auto">
                      <code>{section.code_comparison.pixel_pilot}</code>
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        <div className="absolute inset-0 lovable-gradient" />
        <div className="absolute inset-0 noise-texture" />
        <Navigation />
        <div className="relative z-10 pt-16 pb-24 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p className="text-white">Loading documentation...</p>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  if (!docData) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        <div className="absolute inset-0 lovable-gradient" />
        <div className="absolute inset-0 noise-texture" />
        <Navigation />
        <div className="relative z-10 pt-16 pb-24 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Documentation Not Found</h3>
            <p className="text-gray-400 mb-6">The requested documentation page could not be found.</p>
            <Link href="/docs">
              <Button className="bg-purple-600 hover:bg-purple-700">
                Back to Documentation
              </Button>
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Reading Progress Bar */}
      <div className="fixed top-0 left-0 w-full h-1 bg-gray-800 z-50">
        <div
          className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
          style={{ width: `${readingProgress}%` }}
        />
      </div>

      {/* Enhanced Gradient Background */}
      <div className="absolute inset-0 lovable-gradient" />

      {/* Noise Texture Overlay */}
      <div className="absolute inset-0 noise-texture" />

      {/* Navigation */}
      <Navigation />

      {/* Main Content */}
      <main className="relative z-10 pt-20 pb-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {/* Breadcrumb */}
          <div className="mb-8">
            <nav className="flex items-center space-x-2 text-sm text-gray-400">
              <Link href="/docs" className="hover:text-white transition-colors">
                Documentation
              </Link>
              <ChevronRight className="w-4 h-4" />
              <span className="text-white">{docData.title}</span>
            </nav>
          </div>

          {/* Back Button */}
          <div className="mb-8">
            <Link href="/docs">
              <Button variant="outline" className="border-gray-600 text-white hover:bg-gray-700">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Documentation
              </Button>
            </Link>
          </div>

          {/* Article Header */}
          <div className="mb-12">
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge className="bg-blue-600 text-white">
                Documentation
              </Badge>
              <Badge variant="secondary" className="bg-green-600 text-white">
                Guide
              </Badge>
            </div>

            <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 leading-tight">
              {docData.title}
            </h1>

            <p className="text-xl text-gray-300 leading-relaxed max-w-4xl mb-8">
              {docData.overview}
            </p>

            {/* Article Meta */}
            <div className="flex flex-wrap items-center gap-6 text-gray-400">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4" />
                <span>{Math.ceil(docData.content.split(' ').length / 200)} min read</span>
              </div>
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4" />
                <span>Last updated recently</span>
              </div>
            </div>

            {/* Keywords */}
            <div className="flex flex-wrap gap-2 mt-6">
              {docData.search_keywords.map((keyword: string, keywordIndex: number) => (
                <Badge key={keywordIndex} variant="outline" className="border-gray-600 text-gray-400">
                  <Tag className="w-3 h-3 mr-1" />
                  {keyword}
                </Badge>
              ))}
            </div>
          </div>

          {/* Article Content */}
          <div className="max-w-4xl">
            {/* Introduction Section */}
            <div className="mb-12">
              <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-2xl p-8 border border-purple-500/20">
                <h2 className="text-2xl font-bold text-white mb-6">Introduction</h2>
                <div className="prose prose-invert max-w-none">
                  <p className="text-gray-300 leading-relaxed text-lg mb-6">
                    {docData.overview}
                  </p>
                </div>
              </div>
            </div>

            {/* Main Content Sections */}
            <div className="mb-12">
              {parseContentIntoSections(docData.content, docData.title)}
            </div>

            {/* Keywords Section */}
            <div className="mb-12">
              <div className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-2xl p-8 border border-blue-500/20">
                <h2 className="text-2xl font-bold text-white mb-6">Related Topics</h2>
                <div className="flex flex-wrap gap-2">
                  {docData.search_keywords.map((keyword: string, keywordIndex: number) => (
                    <Badge key={keywordIndex} variant="outline" className="border-blue-500/50 text-blue-300 bg-blue-500/10">
                      {keyword}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Related Documentation */}
          {relatedDocs.length > 0 && (
            <div className="mt-16">
              <h2 className="text-3xl font-bold text-white mb-8">Related Documentation</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {relatedDocs.map((relatedDoc, index) => (
                  <Link key={index} href={`/docs/${relatedDoc.title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/--+/g, '-')}`}>
                    <Card className="bg-gray-800/50 border-gray-700/50 backdrop-blur-sm hover:bg-gray-700/50 transition-colors cursor-pointer group">
                      <CardContent className="p-6">
                        <Badge variant="secondary" className="bg-blue-600 text-white mb-3">
                          Documentation
                        </Badge>
                        <h3 className="text-lg font-semibold text-white mb-3 group-hover:text-purple-400 transition-colors line-clamp-2">
                          {relatedDoc.title}
                        </h3>
                        <p className="text-gray-300 text-sm mb-4 line-clamp-2">
                          {relatedDoc.overview}
                        </p>
                        <div className="flex items-center justify-between text-sm text-gray-400">
                          <span className="flex items-center">
                            <Clock className="w-3 h-3 mr-1" />
                            {Math.ceil(relatedDoc.content.split(' ').length / 200)} min
                          </span>
                          <Badge variant="outline" className="text-xs border-gray-600 text-gray-400">
                            Guide
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-16 flex flex-wrap gap-4 justify-center">
            <Button className="bg-purple-600 hover:bg-purple-700">
              <Share2 className="w-4 h-4 mr-2" />
              Share This Article
            </Button>
            <Button variant="outline" className="border-gray-600 text-white hover:bg-gray-700">
              <Bookmark className="w-4 h-4 mr-2" />
              Save for Later
            </Button>
            <Link href="/docs">
              <Button variant="outline" className="border-gray-600 text-white hover:bg-gray-700">
                <ExternalLink className="w-4 h-4 mr-2" />
                View All Documentation
              </Button>
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  )
}
