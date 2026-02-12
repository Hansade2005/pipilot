"use client"

import { Logo } from "@/components/ui/logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import {
  ArrowLeft,
  Calendar,
  Clock,
  Share2,
  Heart,
  Code,
  MessageCircle,
  User,
  Tag,
  ChevronLeft,
  ChevronRight,
  Eye,
  BookOpen,
  Star,
  ExternalLink,
  Copy,
  Check
} from "lucide-react"
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

interface RelatedPost {
  id: string
  title: string
  excerpt: string
  slug: string
  reading_time: string
  published_date: string
  category: string
}

export default function BlogPostPage() {
  usePageTitle('Community Post')
  const params = useParams()
  const router = useRouter()
  const [blogPost, setBlogPost] = useState<BlogPost | null>(null)
  const [relatedPosts, setRelatedPosts] = useState<RelatedPost[]>([])
  const [allBlogPosts, setAllBlogPosts] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [readingProgress, setReadingProgress] = useState(0)
  const [tableOfContents, setTableOfContents] = useState<Array<{id: string, text: string, level: number}>>([])
  const [activeSection, setActiveSection] = useState<string>('')
  const [showMobileTOC, setShowMobileTOC] = useState(false)

  useEffect(() => {
    const loadBlogPost = async () => {
      try {
        const [blogResponse] = await Promise.all([
          fetch('/blog-posts.json')
        ])

        const blogData = await blogResponse.json()
        const slug = params.slug as string

        setAllBlogPosts(blogData.posts)
        const post = blogData.posts.find((p: BlogPost) => p.slug === slug)

        if (post) {
          setBlogPost(post)

          // Get related posts
          const related = blogData.posts
            .filter((p: BlogPost) =>
              p.id !== post.id &&
              (p.category === post.category || p.tags.some(tag => post.tags.includes(tag)))
            )
            .slice(0, 3)

          setRelatedPosts(related)
        } else {
          router.push('/community')
        }
      } catch (error) {
        console.error('Failed to load blog post:', error)
        router.push('/community')
      } finally {
        setLoading(false)
      }
    }

    loadBlogPost()
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

  // Generate table of contents and set up intersection observer
  useEffect(() => {
    if (blogPost) {
      const toc = []
      toc.push({ id: 'introduction', text: 'Introduction', level: 2 })

      blogPost.content.main_content?.forEach((section, index) => {
        toc.push({
          id: `section-${index}`,
          text: section.heading,
          level: 2
        })
      })

      if (blogPost.content.project_overview) {
        toc.push({ id: 'project-overview', text: 'Project Overview', level: 2 })
      }

      toc.push({ id: 'conclusion', text: 'Conclusion', level: 2 })

      setTableOfContents(toc)

      // Set up intersection observer for active section tracking
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setActiveSection(entry.target.id)
            }
          })
        },
        { threshold: 0.5, rootMargin: '-100px 0px -100px 0px' }
      )

      // Observe all headings
      toc.forEach((item) => {
        const element = document.getElementById(item.id)
        if (element) {
          observer.observe(element)
        }
      })

      return () => observer.disconnect()
    }
  }, [blogPost])

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy: ', err)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'platform-updates': 'bg-blue-500',
      'tutorials': 'bg-green-500',
      'case-studies': 'bg-yellow-500',
      'industry-insights': 'bg-purple-500',
      'best-practices': 'bg-red-500'
    }
    return colors[category] || 'bg-gray-500'
  }

  const renderContentSection = (section: any, index: number) => {
    return (
      <div key={index} id={`section-${index}`} className="mb-12">
        <h2 className="text-3xl font-bold text-white mb-6 leading-tight">
          {section.heading}
        </h2>

        <div className="prose prose-lg prose-invert max-w-none">
          <p className="text-gray-300 leading-relaxed mb-6 text-lg">
            {section.body}
          </p>

          {section.key_points && (
            <div className="bg-gray-800/50 rounded-xl p-6 mb-6 border border-gray-700/50">
              <h3 className="text-xl font-semibold text-white mb-4">Key Points</h3>
              <ul className="space-y-3">
                {section.key_points.map((point: string, idx: number) => (
                  <li key={idx} className="flex items-start">
                    <div className="w-2 h-2 rounded-full bg-purple-500 mt-2 mr-3 flex-shrink-0"></div>
                    <span className="text-gray-300">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {section.technical_highlights && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {section.technical_highlights.map((highlight: string, idx: number) => (
                <Card key={idx} className="bg-gray-800/30 border-gray-700/30">
                  <CardContent className="p-4">
                    <div className="flex items-start space-x-3">
                      <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                        <Code className="w-4 h-4 text-purple-400" />
                      </div>
                      <p className="text-gray-300 text-sm leading-relaxed">{highlight}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {section.market_trends && (
            <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-xl p-6 mb-6 border border-blue-500/20">
              <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
                <Star className="w-5 h-5 text-yellow-400 mr-2" />
                Market Trends
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {section.market_trends.map((trend: string, idx: number) => (
                  <div key={idx} className="flex items-center space-x-3">
                    <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                    <span className="text-gray-300">{trend}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {section.benefits && (
            <div className="bg-green-500/10 rounded-xl p-6 mb-6 border border-green-500/20">
              <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
                <Heart className="w-5 h-5 text-green-400 mr-2" />
                Benefits
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(Array.isArray(section.benefits)
                  ? section.benefits
                  : section.benefits.split(', ')
                ).map((benefit: string, idx: number) => (
                  <div key={idx} className="flex items-start space-x-3">
                    <Check className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-300">{benefit.trim()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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

  if (!blogPost) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        <div className="absolute inset-0 lovable-gradient" />
        <div className="absolute inset-0 noise-texture" />
        <Navigation />
        <div className="relative z-10 pt-16 pb-24 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-white mb-4">Post Not Found</h1>
            <p className="text-gray-300 mb-8">The blog post you're looking for doesn't exist.</p>
            <Link href="/community">
              <Button className="bg-purple-600 hover:bg-purple-700">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Community
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
      {/* Enhanced Gradient Background */}
      <div className="absolute inset-0 lovable-gradient" />

      {/* Noise Texture Overlay */}
      <div className="absolute inset-0 noise-texture" />

      {/* Navigation */}
      <Navigation />

      {/* Reading Progress Bar */}
      <div className="fixed top-0 left-0 w-full h-1 bg-gray-800 z-50">
        <div
          className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-150"
          style={{ width: `${readingProgress}%` }}
        />
      </div>

      {/* Mobile Table of Contents Button */}
      <div className="fixed bottom-6 right-6 z-40 xl:hidden">
        <Button
          onClick={() => setShowMobileTOC(true)}
          className="bg-purple-600 hover:bg-purple-700 text-white rounded-full w-14 h-14 shadow-lg"
        >
          <BookOpen className="w-6 h-6" />
        </Button>
      </div>

      {/* Mobile Table of Contents Modal */}
      {showMobileTOC && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowMobileTOC(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-80 bg-gray-900 border-l border-gray-700">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white">Table of Contents</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowMobileTOC(false)}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </Button>
              </div>
              <nav className="space-y-2 max-h-[calc(100vh-120px)] overflow-y-auto">
                {tableOfContents.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      scrollToSection(item.id)
                      setShowMobileTOC(false)
                    }}
                    className={`block w-full text-left px-3 py-3 rounded text-sm transition-colors ${
                      activeSection === item.id
                        ? 'bg-purple-500/20 text-purple-400 border-l-4 border-purple-400'
                        : 'text-gray-300 hover:text-white hover:bg-gray-700/50'
                    }`}
                    style={{ paddingLeft: `${(item.level - 1) * 12 + 12}px` }}
                  >
                    {item.text}
                  </button>
                ))}
              </nav>
            </div>
          </div>
        </div>
      )}

      <div className="relative z-10 pt-16 pb-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {/* Back Button */}
          <div className="mb-8">
            <Link href="/community">
              <Button variant="ghost" className="text-gray-300 hover:text-white hover:bg-gray-800/50">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Community
              </Button>
            </Link>
          </div>

          {/* Article Content Container */}
          <div className="max-w-4xl mx-auto xl:max-w-none xl:flex xl:gap-8">
            {/* Table of Contents - Desktop */}
            <div className="hidden xl:block xl:w-64 xl:flex-shrink-0">
              <div className="sticky top-24">
                <Card className="bg-gray-800/30 border-gray-700/30">
                  <CardHeader>
                    <h3 className="text-lg font-semibold text-white">Table of Contents</h3>
                  </CardHeader>
                  <CardContent className="p-4">
                    <nav className="space-y-2">
                      {tableOfContents.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => scrollToSection(item.id)}
                          className={`block w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                            activeSection === item.id
                              ? 'bg-purple-500/20 text-purple-400 border-l-2 border-purple-400'
                              : 'text-gray-300 hover:text-white hover:bg-gray-700/50'
                          }`}
                          style={{ paddingLeft: `${(item.level - 1) * 12 + 12}px` }}
                        >
                          {item.text}
                        </button>
                      ))}
                    </nav>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Main Article Content */}
            <div className="xl:flex-1 xl:min-w-0">

          {/* Hero Section */}
          <div className="mb-12">
            {/* Category Badge */}
            <div className="mb-6">
              <Badge className={`${getCategoryColor(blogPost.category)} text-white px-4 py-2 text-sm font-medium`}>
                {blogPost.category.replace('-', ' ').toUpperCase()}
              </Badge>
            </div>

            {/* Title */}
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 leading-tight">
              {blogPost.title}
            </h1>

            {/* Meta Information */}
            <div className="flex flex-wrap items-center gap-6 text-gray-300 mb-8">
              <div className="flex items-center space-x-2">
                <User className="w-4 h-4" />
                <span>{blogPost.author}</span>
              </div>
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4" />
                <span>{formatDate(blogPost.published_date)}</span>
              </div>
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4" />
                <span>{blogPost.reading_time}</span>
              </div>
              <div className="flex items-center space-x-2">
                <Eye className="w-4 h-4" />
                <span>1.2k views</span>
              </div>
            </div>

            {/* Excerpt */}
            <p className="text-xl text-gray-300 leading-relaxed max-w-4xl">
              {blogPost.excerpt}
            </p>
          </div>

            {/* Article Content */}
            <div className="max-w-4xl">
              {/* Introduction */}
              <div id="introduction" className="mb-12">
                <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-2xl p-8 border border-purple-500/20">
                  <h2 className="text-2xl font-bold text-white mb-4">Introduction</h2>
                <p className="text-gray-300 leading-relaxed text-lg">
                  {blogPost.content.introduction}
                </p>
              </div>
            </div>

            {/* Main Content Sections */}
            {blogPost.content.main_content?.map((section, index) => renderContentSection(section, index))}

            {/* Special Sections */}
            {blogPost.content.project_overview && (
              <div id="project-overview" className="mb-12">
                <h2 className="text-3xl font-bold text-white mb-6">Project Overview</h2>
                <Card className="bg-gray-800/30 border-gray-700/30">
                  <CardContent className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h3 className="text-lg font-semibold text-white mb-3">Application</h3>
                        <p className="text-gray-300">{blogPost.content.project_overview.application}</p>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-white mb-3">Timeline</h3>
                        <p className="text-gray-300">{blogPost.content.project_overview.timeline}</p>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-white mb-3">Technologies</h3>
                        <div className="flex flex-wrap gap-2">
                          {(Array.isArray(blogPost.content.project_overview.technologies)
                            ? blogPost.content.project_overview.technologies
                            : blogPost.content.project_overview.technologies.split(', ')
                          ).map((tech: string, idx: number) => (
                            <Badge key={idx} variant="secondary" className="bg-purple-500/20 text-purple-300">
                              {tech.trim()}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-white mb-3">Features</h3>
                        <ul className="space-y-1">
                          {blogPost.content.project_overview.features.slice(0, 4).map((feature: string, idx: number) => (
                            <li key={idx} className="text-gray-300 text-sm">• {feature}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Conclusion */}
            <div id="conclusion" className="mb-12">
              <div className="bg-gradient-to-r from-green-500/10 to-blue-500/10 rounded-2xl p-8 border border-green-500/20">
                <h2 className="text-3xl font-bold text-white mb-6">Conclusion</h2>
                <p className="text-gray-300 leading-relaxed text-lg">
                  {blogPost.content.conclusion}
                </p>
              </div>
            </div>

            {/* Tags */}
            <div className="mb-12">
              <h3 className="text-xl font-semibold text-white mb-4">Tags</h3>
              <div className="flex flex-wrap gap-3">
                {blogPost.tags.map((tag, index) => (
                  <Badge key={index} variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-700/50 px-4 py-2">
                    <Tag className="w-3 h-3 mr-2" />
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Social Sharing */}
            <div className="mb-12">
              <h3 className="text-xl font-semibold text-white mb-4">Share this article</h3>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  className="border-gray-600 text-gray-300 hover:bg-gray-700/50"
                  onClick={copyToClipboard}
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-2" />
                      Copy Link
                    </>
                  )}
                </Button>
                <Button variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-700/50">
                  <Share2 className="w-4 h-4 mr-2" />
                  Share
                </Button>
              </div>
            </div>
          </div>

          {/* Related Posts */}
          {relatedPosts.length > 0 && (
            <div className="mt-16">
              <h2 className="text-3xl font-bold text-white mb-8">Related Articles</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {relatedPosts.map((post) => (
                  <Link key={post.id} href={`/community/${post.slug}`}>
                    <Card className="bg-gray-800/30 border-gray-700/30 hover:bg-gray-700/50 transition-colors cursor-pointer group">
                      <CardContent className="p-6">
                        <Badge className={`${getCategoryColor(post.category)} text-white mb-3`}>
                          {post.category.replace('-', ' ')}
                        </Badge>
                        <h3 className="text-lg font-semibold text-white mb-3 group-hover:text-purple-400 transition-colors line-clamp-2">
                          {post.title}
                        </h3>
                        <p className="text-gray-300 text-sm mb-4 line-clamp-3">
                          {post.excerpt}
                        </p>
                        <div className="flex items-center justify-between text-sm text-gray-400">
                          <span>{post.reading_time}</span>
                          <span>{formatDate(post.published_date)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Author Bio */}
          <div className="mt-16">
            <Card className="bg-gray-800/30 border-gray-700/30">
              <CardContent className="p-6">
                <div className="flex items-start space-x-4">
                  <Avatar className="w-16 h-16">
                    <AvatarImage src="/hans.png" />
                    <AvatarFallback className="bg-purple-500 text-white text-xl">
                      {blogPost.author.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-white mb-2">About {blogPost.author}</h3>
                    <p className="text-gray-300 mb-4">
                      {blogPost.author} is a technology expert and content creator specializing in AI-powered development,
                      modern web technologies, and innovative software solutions.
                    </p>
                    <div className="flex space-x-4">
                      <Button variant="outline" size="sm" className="border-gray-600 text-gray-300 hover:bg-gray-700/50">
                        <MessageCircle className="w-4 h-4 mr-2" />
                        Contact
                      </Button>
                      <Button variant="outline" size="sm" className="border-gray-600 text-gray-300 hover:bg-gray-700/50">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Portfolio
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <Footer />
    </div>
  )
}
