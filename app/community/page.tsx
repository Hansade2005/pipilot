"use client"

import { Logo } from "@/components/ui/logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { BookOpen, Search, Clock, Calendar, Filter, ArrowRight, X } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { useEffect, useState } from "react"
import Link from "next/link"
import { usePageTitle } from '@/hooks/use-page-title'

interface BlogPost {
  id: string
  title: string
  slug: string
  excerpt: string
  content: {
    introduction: string
    main_content: Array<{
      heading: string
      body: string
      key_points?: string[]
      technical_highlights?: string[]
      market_trends?: string[]
      benefits?: string[]
      features?: string[]
      challenges?: string[]
      solutions?: string[]
    }>
    conclusion: string
    project_overview?: any
    development_journey?: any
    results_and_metrics?: any
    lessons_learned?: any
    case_studies?: any
    advanced_usage?: any
    real_world_examples?: any
  }
  author: string
  published_date: string
  last_modified: string
  category: string
  tags: string[]
  featured_image: string
  reading_time: string
  seo_meta: {
    title: string
    description: string
    keywords: string[]
  }
  related_posts: string[]
  status: string
}

export default function BlogPage() {
  usePageTitle('Community')
  const [allBlogPosts, setAllBlogPosts] = useState<BlogPost[]>([])
  const [filteredPosts, setFilteredPosts] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [selectedTag, setSelectedTag] = useState<string>("all")

  const categories = [
    { id: "all", name: "All Posts", count: 0 },
    { id: "platform-updates", name: "Platform Updates", count: 0 },
    { id: "tutorials", name: "Tutorials", count: 0 },
    { id: "case-studies", name: "Case Studies", count: 0 },
    { id: "industry-insights", name: "Industry Insights", count: 0 },
    { id: "best-practices", name: "Best Practices", count: 0 }
  ]

  useEffect(() => {
    const loadBlogPosts = async () => {
      try {
        const response = await fetch('/blog-posts.json')
        const data = await response.json()
        const posts = data.posts || []

        setAllBlogPosts(posts)
        setFilteredPosts(posts)

        // Update category counts
        categories.forEach((cat: any) => {
          if (cat.id === "all") {
            cat.count = posts.length
          } else {
            cat.count = posts.filter((post: BlogPost) => post.category === cat.id).length
          }
        })
      } catch (error) {
        console.error('Failed to load blog posts:', error)
      } finally {
        setLoading(false)
      }
    }

    loadBlogPosts()
  }, [])

  // Live search and filtering
  useEffect(() => {
    let filtered = allBlogPosts

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(post =>
        post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.excerpt.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())) ||
        post.author.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    // Category filter
    if (selectedCategory !== "all") {
      filtered = filtered.filter(post => post.category === selectedCategory)
    }

    // Tag filter
    if (selectedTag !== "all") {
      filtered = filtered.filter(post => post.tags.includes(selectedTag))
    }

    setFilteredPosts(filtered)
  }, [searchQuery, selectedCategory, selectedTag, allBlogPosts])

  const clearFilters = () => {
    setSearchQuery("")
    setSelectedCategory("all")
    setSelectedTag("all")
  }

  const allTags = Array.from(
    new Set(allBlogPosts.flatMap(post => post.tags))
  ).sort()

  if (loading) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        <div className="absolute inset-0 lovable-gradient" />
        <div className="absolute inset-0 noise-texture" />
        <Navigation />
        <div className="relative z-10 pt-16 pb-24 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p className="text-white">Loading blog posts...</p>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Enhanced Gradient Background */}
      <div className="absolute inset-0 lovable-gradient" />

      {/* Noise Texture Overlay */}
      <div className="absolute inset-0 noise-texture" />

      {/* Navigation */}
      <Navigation />

      {/* Main Content */}
      <main className="relative z-10 pt-16 pb-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {/* Hero Section */}
          <div className="text-center mb-16">
            <div className="flex items-center justify-center mb-4">
              <div className="w-6 h-6 rounded-full heart-gradient flex items-center justify-center">
                <BookOpen className="w-3 h-3 text-white" />
              </div>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
              PiPilot Blog
            </h1>
            <p className="text-xl text-white/80 max-w-3xl mx-auto">
              Discover the latest insights, tutorials, and updates from the world of AI-powered development.
            </p>
          </div>

          {/* Search and Filter Section */}
          <div className="mb-12">
            <div className="max-w-4xl mx-auto">
              {/* Search Bar */}
              <div className="relative mb-6">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search articles, tags, or authors..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-12 pr-4 py-4 text-lg bg-gray-800/50 border-gray-700/50 text-white placeholder-gray-400 focus:border-purple-500 focus:ring-purple-500 rounded-xl"
                  />
                  {(searchQuery || selectedCategory !== "all" || selectedTag !== "all") && (
                    <Button
                      onClick={clearFilters}
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap gap-4 items-center justify-center">
                {/* Category Filter */}
                <div className="flex items-center space-x-2">
                  <Filter className="w-4 h-4 text-gray-400" />
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:ring-purple-500"
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name} ({category.count})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Tag Filter */}
                <div className="flex items-center space-x-2">
                  <span className="text-gray-400 text-sm">Tag:</span>
                  <select
                    value={selectedTag}
                    onChange={(e) => setSelectedTag(e.target.value)}
                    className="bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:ring-purple-500"
                  >
                    <option value="all">All Tags</option>
                    {allTags.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Active Filters Display */}
              {(searchQuery || selectedCategory !== "all" || selectedTag !== "all") && (
                <div className="mt-4 flex flex-wrap gap-2 justify-center">
                  {searchQuery && (
                    <Badge variant="secondary" className="bg-purple-600 text-white">
                      Search: "{searchQuery}"
                    </Badge>
                  )}
                  {selectedCategory !== "all" && (
                    <Badge variant="secondary" className="bg-blue-600 text-white">
                      Category: {categories.find(c => c.id === selectedCategory)?.name}
                    </Badge>
                  )}
                  {selectedTag !== "all" && (
                    <Badge variant="secondary" className="bg-green-600 text-white">
                      Tag: {selectedTag}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Results Summary */}
          <div className="text-center mb-8">
            <p className="text-gray-300">
              {filteredPosts.length === allBlogPosts.length
                ? `Showing all ${allBlogPosts.length} articles`
                : `Found ${filteredPosts.length} of ${allBlogPosts.length} articles`
              }
            </p>
          </div>

          {/* Blog Posts Grid */}
          {filteredPosts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
              {filteredPosts.map((post, index) => {
                const thumbnailGradients = [
                  "bg-gradient-to-br from-blue-500 to-purple-600",
                  "bg-gradient-to-br from-green-500 to-blue-600",
                  "bg-gradient-to-br from-purple-500 to-pink-600",
                  "bg-gradient-to-br from-yellow-500 to-orange-600",
                  "bg-gradient-to-br from-cyan-500 to-blue-600",
                  "bg-gradient-to-br from-emerald-500 to-teal-600"
                ]

                return (
                  <Link key={post.id} href={`/community/${post.slug || post.id}`}>
                    <Card className="bg-gray-800/50 border-gray-700/50 backdrop-blur-sm hover:bg-gray-700/50 transition-colors cursor-pointer group h-full">
                      <div className={`h-48 ${thumbnailGradients[index % thumbnailGradients.length]} rounded-t-lg flex items-center justify-center relative overflow-hidden`}>
                        <BookOpen className="w-12 h-12 text-white/80" />
                        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors"></div>
                      </div>
                      <CardContent className="p-6 flex-1 flex flex-col">
                        <Badge className={`w-fit mb-3 ${
                          post.category === 'platform-updates' ? 'bg-blue-500' :
                          post.category === 'tutorials' ? 'bg-green-500' :
                          post.category === 'case-studies' ? 'bg-yellow-500' :
                          post.category === 'industry-insights' ? 'bg-purple-500' :
                          post.category === 'best-practices' ? 'bg-orange-500' :
                          'bg-red-500'
                        } text-white`}>
                          {post.category.replace('-', ' ').toUpperCase()}
                        </Badge>
                        <h3 className="text-lg font-semibold text-white mb-3 group-hover:text-purple-400 transition-colors line-clamp-2 leading-tight">
                          {post.title}
                        </h3>
                        <p className="text-gray-300 text-sm mb-4 line-clamp-3 flex-1">
                          {post.excerpt}
                        </p>
                        <div className="flex items-center justify-between text-sm text-gray-400 mt-auto">
                          <span className="flex items-center">
                            <Clock className="w-3 h-3 mr-1" />
                            {post.reading_time}
                          </span>
                          <span>{new Date(post.published_date).toLocaleDateString()}</span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-3">
                          {post.tags?.slice(0, 2).map((tag: string, tagIndex: number) => (
                            <Badge key={tagIndex} variant="outline" className="text-xs border-gray-600 text-gray-400">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-16">
              <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">No articles found</h3>
              <p className="text-gray-400 mb-4">
                Try adjusting your search terms or filters to find what you're looking for.
              </p>
              <Button onClick={clearFilters} variant="outline" className="border-gray-600 text-white hover:bg-gray-700">
                Clear Filters
              </Button>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  )
}
