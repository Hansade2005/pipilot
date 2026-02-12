"use client"

import { Logo } from "@/components/ui/logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BookOpen, ArrowLeft, Clock, Calendar, Tag, ChevronRight, ExternalLink, Share2, Bookmark } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
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

export default function BlogPostPage() {
  usePageTitle('Blog Post')
  const params = useParams()
  const router = useRouter()
  const [postData, setPostData] = useState<BlogPost | null>(null)
  const [categoryData, setCategoryData] = useState<Category | null>(null)
  const [relatedPosts, setRelatedPosts] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)
  const [readingProgress, setReadingProgress] = useState(0)

  useEffect(() => {
    const loadPostData = async () => {
      try {
        const response = await fetch('/blog-posts.json')
        const data = await response.json()
        const slug = params.slug as string

        // Find the post by ID or slug
        let foundPost: BlogPost | null = null
        let foundCategory: Category | null = null

        for (const post of data.posts || []) {
          if (post.slug === slug || post.id === slug) {
            foundPost = post
            // Find the category for this post
            const category = data.categories.find((cat: Category) => cat.id === post.category)
            foundCategory = category || null
            break
          }
        }

        if (foundPost) {
          setPostData(foundPost)
          setCategoryData(foundCategory)

          // Get related posts
          const related = data.posts
            .filter((post: BlogPost) => post.id !== foundPost!.id && post.category === foundPost!.category)
            .slice(0, 3)
          setRelatedPosts(related)
        } else {
          router.push('/blog')
        }
      } catch (error) {
        console.error('Failed to load blog post:', error)
        router.push('/blog')
      } finally {
        setLoading(false)
      }
    }

    if (params.slug) {
      loadPostData()
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

  const renderContentSection = (section: any, index: number) => {
    if (!section) return null

    return (
      <div key={index} id={`section-${index}`} className="mb-12">
        <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-2xl p-8 border border-purple-500/20">
          {section.heading && (
            <h2 className="text-2xl font-bold text-white mb-6">{section.heading}</h2>
          )}
          <div className="prose prose-invert max-w-none">
            {section.body && (
              <p className="text-gray-300 leading-relaxed text-lg mb-6">
                {section.body}
              </p>
            )}

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

            {section.real_world_example && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white mb-3">Real-World Example</h3>
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/30">
                  {section.real_world_example.scenario && (
                    <p className="text-gray-300 mb-3"><strong>Scenario:</strong> {section.real_world_example.scenario}</p>
                  )}
                  {section.real_world_example.traditional_approach && (
                    <p className="text-gray-300 mb-3"><strong>Traditional Approach:</strong> {section.real_world_example.traditional_approach}</p>
                  )}
                  {section.real_world_example.pixel_pilot_approach && (
                    <p className="text-gray-300 mb-3"><strong>PiPilot Approach:</strong> {section.real_world_example.pixel_pilot_approach}</p>
                  )}
                  {section.real_world_example.code_comparison && (
                    <div className="mt-4 space-y-3">
                      <div>
                        <p className="text-gray-400 text-sm mb-1">Traditional Code:</p>
                        <pre className="bg-gray-800/50 p-3 rounded text-sm text-gray-300 overflow-x-auto">
                          <code>{section.real_world_example.code_comparison.traditional}</code>
                        </pre>
                      </div>
                      <div>
                        <p className="text-gray-400 text-sm mb-1">PiPilot Code:</p>
                        <pre className="bg-gray-800/50 p-3 rounded text-sm text-gray-300 overflow-x-auto">
                          <code>{section.real_world_example.code_comparison.pixel_pilot}</code>
                        </pre>
                      </div>
                    </div>
                  )}
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
            <p className="text-white">Loading blog post...</p>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  if (!postData || !categoryData) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        <div className="absolute inset-0 lovable-gradient" />
        <div className="absolute inset-0 noise-texture" />
        <Navigation />
        <div className="relative z-10 pt-16 pb-24 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Blog Post Not Found</h3>
            <p className="text-gray-400 mb-6">The requested blog post could not be found.</p>
            <Link href="/blog">
              <Button className="bg-purple-600 hover:bg-purple-700">
                Back to Blog
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
              <Link href="/blog" className="hover:text-white transition-colors">
                Blog
              </Link>
              <ChevronRight className="w-4 h-4" />
              <Link href={`/blog?category=${categoryData.id}`} className="hover:text-white transition-colors">
                {categoryData.name}
              </Link>
              <ChevronRight className="w-4 h-4" />
              <span className="text-white">{postData.title}</span>
            </nav>
          </div>

          {/* Back Button */}
          <div className="mb-8">
            <Link href="/blog">
              <Button variant="outline" className="border-gray-600 text-white hover:bg-gray-700">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Blog
              </Button>
            </Link>
          </div>

          {/* Article Header */}
          <div className="mb-12">
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge className={`bg-${categoryData.color.split('-')[1]}-600 text-white`}>
                {categoryData.name}
              </Badge>
              <Badge variant="secondary" className="bg-gray-700 text-gray-300">
                {postData.category.replace('-', ' ').toUpperCase()}
              </Badge>
            </div>

            <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 leading-tight">
              {postData.title}
            </h1>

            <p className="text-xl text-gray-300 leading-relaxed max-w-4xl mb-8">
              {postData.excerpt}
            </p>

            {/* Article Meta */}
            <div className="flex flex-wrap items-center gap-6 text-gray-400">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center">
                  <span className="text-white text-sm font-medium">
                    {postData.author.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span>By {postData.author}</span>
              </div>
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4" />
                <span>{postData.reading_time}</span>
              </div>
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4" />
                <span>{new Date(postData.published_date).toLocaleDateString()}</span>
              </div>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-2 mt-6">
              {postData.tags.map((tag: string, tagIndex: number) => (
                <Badge key={tagIndex} variant="outline" className="border-gray-600 text-gray-400">
                  <Tag className="w-3 h-3 mr-1" />
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          {/* Article Content */}
          <div className="max-w-4xl">
            {/* Introduction */}
            {postData.content?.introduction && (
              <div id="introduction" className="mb-12">
                <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-2xl p-8 border border-purple-500/20">
                  <h2 className="text-2xl font-bold text-white mb-4">Introduction</h2>
                  <p className="text-gray-300 leading-relaxed text-lg">
                    {postData.content.introduction}
                  </p>
                </div>
              </div>
            )}

            {/* Main Content Sections */}
            {postData.content?.main_content?.map((section: any, index: number) =>
              renderContentSection(section, index)
            )}

            {/* Special Sections */}
            {postData.content?.ai_agent_architecture && (
              <div id="ai-agent-architecture" className="mb-12">
                <div className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-2xl p-8 border border-blue-500/20">
                  <h2 className="text-2xl font-bold text-white mb-6">AI Agent Architecture</h2>
                  <div className="space-y-6">
                    {postData.content.ai_agent_architecture.core_components?.map((component: any, index: number) => (
                      <div key={index} className="bg-gray-800/50 rounded-lg p-6 border border-gray-700/50">
                        <h3 className="text-lg font-semibold text-white mb-2">{component.component}</h3>
                        <p className="text-gray-300 mb-4">{component.function}</p>
                        {component.capabilities && (
                          <div className="space-y-2">
                            {component.capabilities.map((capability: string, capIndex: number) => (
                              <div key={capIndex} className="flex items-start space-x-2">
                                <div className="w-2 h-2 rounded-full bg-blue-400 mt-2 flex-shrink-0"></div>
                                <span className="text-gray-300">{capability}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Conclusion */}
            {postData.content?.conclusion && (
              <div id="conclusion" className="mb-12">
                <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-2xl p-8 border border-green-500/20">
                  <h2 className="text-2xl font-bold text-white mb-4">Conclusion</h2>
                  <p className="text-gray-300 leading-relaxed text-lg">
                    {postData.content.conclusion}
                  </p>
                </div>
              </div>
            )}

            {postData.content?.closing_thoughts && (
              <div id="closing-thoughts" className="mb-12">
                <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-2xl p-8 border border-green-500/20">
                  <h2 className="text-2xl font-bold text-white mb-4">Closing Thoughts</h2>
                  <p className="text-gray-300 leading-relaxed text-lg">
                    {postData.content.closing_thoughts}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Related Posts */}
          {relatedPosts.length > 0 && (
            <div className="mt-16">
              <h2 className="text-3xl font-bold text-white mb-8">Related Posts</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {relatedPosts.map((relatedPost, index) => (
                  <Link key={index} href={`/blog/${relatedPost.slug}`}>
                    <Card className="bg-gray-800/50 border-gray-700/50 backdrop-blur-sm hover:bg-gray-700/50 transition-colors cursor-pointer group">
                      <CardContent className="p-6">
                        <Badge variant="secondary" className="bg-blue-600 text-white mb-3">
                          {relatedPost.category.replace('-', ' ').toUpperCase()}
                        </Badge>
                        <h3 className="text-lg font-semibold text-white mb-3 group-hover:text-purple-400 transition-colors line-clamp-2">
                          {relatedPost.title}
                        </h3>
                        <p className="text-gray-300 text-sm mb-4 line-clamp-2">
                          {relatedPost.excerpt}
                        </p>
                        <div className="flex items-center justify-between text-sm text-gray-400">
                          <span className="flex items-center">
                            <Clock className="w-3 h-3 mr-1" />
                            {relatedPost.reading_time}
                          </span>
                          <span>{new Date(relatedPost.published_date).toLocaleDateString()}</span>
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
              Share This Post
            </Button>
            <Button variant="outline" className="border-gray-600 text-white hover:bg-gray-700">
              <Bookmark className="w-4 h-4 mr-2" />
              Save for Later
            </Button>
            <Link href="/blog">
              <Button variant="outline" className="border-gray-600 text-white hover:bg-gray-700">
                <ExternalLink className="w-4 h-4 mr-2" />
                View All Posts
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
