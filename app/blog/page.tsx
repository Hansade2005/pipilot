"use client"

import { useState, useEffect } from "react"
import { Logo } from "@/components/ui/logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  BookOpen,
  Clock,
  Calendar,
  Tag,
  Search,
  Filter,
  ChevronDown,
  User,
  ExternalLink,
  ArrowUp
} from "lucide-react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import Link from "next/link"
import { usePageTitle } from '@/hooks/use-page-title'

interface BlogPost {
  id: string
  title: string
  slug: string
  excerpt: string
  content: any
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
    keywords: string
  }
  related_posts: string[]
  status: string
}

interface Category {
  id: string
  name: string
  description: string
  color: string
}

export default function BlogPage() {
  usePageTitle('Blog')
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [filteredPosts, setFilteredPosts] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [sortBy, setSortBy] = useState<string>("newest")

  useEffect(() => {
    const loadBlogData = async () => {
      try {
        const response = await fetch('/blog-posts.json')
        const data = await response.json()
        setPosts(data.posts || [])
        setCategories(data.categories || [])
        setFilteredPosts(data.posts || [])
      } catch (error) {
        console.error('Failed to load blog data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadBlogData()
  }, [])

  useEffect(() => {
    let filtered = [...posts]

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(post =>
        post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.excerpt.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    }

    // Apply category filter
    if (selectedCategory !== "all") {
      filtered = filtered.filter(post => post.category === selectedCategory)
    }

    // Apply sorting
    switch (sortBy) {
      case "newest":
        filtered.sort((a, b) => new Date(b.published_date).getTime() - new Date(a.published_date).getTime())
        break
      case "oldest":
        filtered.sort((a, b) => new Date(a.published_date).getTime() - new Date(b.published_date).getTime())
        break
      case "reading_time":
        filtered.sort((a, b) => {
          const timeA = parseInt(a.reading_time.split(' ')[0])
          const timeB = parseInt(b.reading_time.split(' ')[0])
          return timeA - timeB
        })
        break
      default:
        break
    }

    setFilteredPosts(filtered)
  }, [posts, searchQuery, selectedCategory, sortBy])

  const getCategoryColor = (categoryId: string) => {
    const category = categories.find(cat => cat.id === categoryId)
    return category?.color || "bg-gray-600"
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
      <main className="relative z-10 pt-20 pb-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 leading-tight">
              PiPilot Blog
            </h1>
            <p className="text-xl text-gray-300 leading-relaxed max-w-3xl mx-auto mb-8">
              Insights, tutorials, and stories from the world of AI-powered development.
              Discover how PiPilot is transforming software creation.
            </p>
            <div className="flex items-center justify-center space-x-4 text-gray-400">
              <div className="flex items-center space-x-2">
                <BookOpen className="w-5 h-5" />
                <span>{posts.length} Articles</span>
              </div>
              <div className="flex items-center space-x-2">
                <User className="w-5 h-5" />
                <span>Expert Insights</span>
              </div>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="mb-12">
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              {/* Search */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  type="text"
                  placeholder="Search articles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-gray-800/50 border-gray-600 text-white placeholder-gray-400 focus:border-purple-500"
                />
              </div>

              {/* Category Filter */}
              <div className="relative">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="appearance-none bg-gray-800/50 border border-gray-600 text-white px-4 py-2 pr-8 rounded-lg focus:border-purple-500 focus:outline-none"
                >
                  <option value="all">All Categories</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
              </div>

              {/* Sort Options */}
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="appearance-none bg-gray-800/50 border border-gray-600 text-white px-4 py-2 pr-8 rounded-lg focus:border-purple-500 focus:outline-none"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="reading_time">Shortest Read</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
              </div>
            </div>

            {/* Results Summary */}
            <div className="flex items-center justify-between text-gray-400">
              <span>
                {filteredPosts.length === posts.length
                  ? `Showing all ${posts.length} articles`
                  : `Showing ${filteredPosts.length} of ${posts.length} articles`
                }
              </span>
              {(searchQuery || selectedCategory !== "all") && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSearchQuery("")
                    setSelectedCategory("all")
                  }}
                  className="text-purple-400 hover:text-purple-300"
                >
                  Clear filters
                </Button>
              )}
            </div>
          </div>

          {/* Featured Post */}
          {filteredPosts.length > 0 && (
            <div className="mb-16">
              <h2 className="text-2xl font-bold text-white mb-8">Featured Article</h2>
              <Link href={`/blog/${filteredPosts[0].slug}`}>
                <Card className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-purple-500/20 backdrop-blur-sm hover:from-purple-500/20 hover:to-pink-500/20 transition-all duration-300 cursor-pointer group">
                  <CardContent className="p-8">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:space-x-8">
                      <div className="flex-1">
                        <Badge className={`bg-${getCategoryColor(filteredPosts[0].category)} text-white mb-4`}>
                          {categories.find(cat => cat.id === filteredPosts[0].category)?.name || filteredPosts[0].category}
                        </Badge>
                        <h3 className="text-3xl font-bold text-white mb-4 group-hover:text-purple-400 transition-colors">
                          {filteredPosts[0].title}
                        </h3>
                        <p className="text-gray-300 text-lg leading-relaxed mb-6">
                          {filteredPosts[0].excerpt}
                        </p>
                        <div className="flex flex-wrap items-center gap-6 text-gray-400">
                          <div className="flex items-center space-x-2">
                            <User className="w-4 h-4" />
                            <span>{filteredPosts[0].author}</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Clock className="w-4 h-4" />
                            <span>{filteredPosts[0].reading_time}</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Calendar className="w-4 h-4" />
                            <span>{new Date(filteredPosts[0].published_date).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-6 lg:mt-0 lg:flex-shrink-0">
                        <div className="w-full lg:w-80 h-48 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                          <BookOpen className="w-16 h-16 text-purple-400" />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </div>
          )}

          {/* Blog Posts Grid */}
          {filteredPosts.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
                {filteredPosts.slice(1).map((post, index) => (
                  <Link key={index} href={`/blog/${post.slug}`}>
                    <Card className="bg-gray-800/50 border-gray-700/50 backdrop-blur-sm hover:bg-gray-700/50 transition-all duration-300 cursor-pointer group h-full">
                      <CardContent className="p-6 flex flex-col h-full">
                        <div className="flex-1">
                          <Badge className={`bg-${getCategoryColor(post.category)} text-white mb-3`}>
                            {categories.find(cat => cat.id === post.category)?.name || post.category}
                          </Badge>
                          <h3 className="text-xl font-semibold text-white mb-3 group-hover:text-purple-400 transition-colors line-clamp-2">
                            {post.title}
                          </h3>
                          <p className="text-gray-300 text-sm mb-4 line-clamp-3">
                            {post.excerpt}
                          </p>
                        </div>

                        {/* Tags */}
                        <div className="flex flex-wrap gap-1 mb-4">
                          {post.tags.slice(0, 3).map((tag, tagIndex) => (
                            <Badge key={tagIndex} variant="outline" className="text-xs border-gray-600 text-gray-400">
                              {tag}
                            </Badge>
                          ))}
                          {post.tags.length > 3 && (
                            <Badge variant="outline" className="text-xs border-gray-600 text-gray-400">
                              +{post.tags.length - 3}
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-sm text-gray-400 mt-auto">
                          <div className="flex items-center space-x-4">
                            <span className="flex items-center">
                              <Clock className="w-3 h-3 mr-1" />
                              {post.reading_time}
                            </span>
                            <span>{new Date(post.published_date).toLocaleDateString()}</span>
                          </div>
                          <ExternalLink className="w-4 h-4 text-gray-500 group-hover:text-purple-400 transition-colors" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>

              {/* Load More Button */}
              {filteredPosts.length > 6 && (
                <div className="text-center">
                  <Button size="lg" className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-3">
                    Load More Articles
                    <ArrowUp className="w-4 h-4 ml-2 rotate-45" />
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16">
              <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">No Articles Found</h3>
              <p className="text-gray-400 mb-6">
                {searchQuery || selectedCategory !== "all"
                  ? "Try adjusting your search or filter criteria."
                  : "No blog articles are available at the moment."
                }
              </p>
              {(searchQuery || selectedCategory !== "all") && (
                <Button
                  onClick={() => {
                    setSearchQuery("")
                    setSelectedCategory("all")
                  }}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  Clear Filters
                </Button>
              )}
            </div>
          )}

          {/* Categories Section */}
          <div className="mt-16">
            <h2 className="text-3xl font-bold text-white mb-8">Explore by Category</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {categories.map((category, index) => (
                <Card
                  key={index}
                  className="bg-gray-800/50 border-gray-700/50 backdrop-blur-sm hover:bg-gray-700/50 transition-all duration-300 cursor-pointer group"
                  onClick={() => setSelectedCategory(category.id)}
                >
                  <CardContent className="p-6">
                    <div className={`w-12 h-12 rounded-lg bg-${category.color.split('-')[1]}-600/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                      <div className={`w-6 h-6 rounded bg-${category.color.split('-')[1]}-500`}></div>
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-purple-400 transition-colors">
                      {category.name}
                    </h3>
                    <p className="text-gray-400 text-sm mb-4">
                      {category.description}
                    </p>
                    <div className="text-purple-400 text-sm font-medium">
                      {posts.filter(post => post.category === category.id).length} articles
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Newsletter Signup */}
          <div className="mt-16">
            <Card className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-purple-500/20 backdrop-blur-sm">
              <CardContent className="p-8 text-center">
                <h3 className="text-2xl font-bold text-white mb-4">
                  Stay Updated with Latest Insights
                </h3>
                <p className="text-gray-300 mb-6 max-w-2xl mx-auto">
                  Get the latest articles, tutorials, and insights about AI-powered development delivered to your inbox.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    className="bg-gray-800/50 border-gray-600 text-white placeholder-gray-400 focus:border-purple-500"
                  />
                  <Button className="bg-purple-600 hover:bg-purple-700 whitespace-nowrap">
                    Subscribe
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  )
}
