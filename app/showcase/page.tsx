"use client"

import { useState, useEffect } from "react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Badge } from "@/components/ui/badge"
import { ExternalLink, Eye, Heart, Search, SlidersHorizontal } from "lucide-react"
import { usePageTitle } from '@/hooks/use-page-title'

interface ShowcaseProject {
  id: string
  title: string
  description: string
  category: string
  thumbnail_url: string
  live_url: string
  tech_stack: string[]
  views: number
  likes: number
  created_at: string
  user_id: string
}

const CATEGORIES = [
  { value: 'all', label: 'All Projects' },
  { value: 'landing-page', label: 'Landing Pages' },
  { value: 'dashboard', label: 'Dashboards' },
  { value: 'portfolio', label: 'Portfolios' },
  { value: 'ecommerce', label: 'E-commerce' },
  { value: 'saas', label: 'SaaS' },
  { value: 'blog', label: 'Blogs' },
  { value: 'general', label: 'General' },
]

export default function ShowcasePage() {
  usePageTitle('Showcase')
  const [projects, setProjects] = useState<ShowcaseProject[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState('recent')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchProjects()
  }, [category, sort])

  const fetchProjects = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ sort, limit: '50' })
      if (category !== 'all') params.set('category', category)
      const res = await fetch(`/api/showcase?${params}`)
      const data = await res.json()
      setProjects(data.projects || [])
    } catch (err) {
      console.error('Failed to fetch showcase:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleLike = async (id: string) => {
    try {
      await fetch('/api/showcase', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'like' })
      })
      setProjects(prev => prev.map(p => p.id === id ? { ...p, likes: p.likes + 1 } : p))
    } catch {}
  }

  const handleView = async (id: string, url: string) => {
    fetch('/api/showcase', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'view' })
    }).catch(() => {})
    window.open(url, '_blank')
  }

  const filtered = search
    ? projects.filter(p => p.title.toLowerCase().includes(search.toLowerCase()) || p.description?.toLowerCase().includes(search.toLowerCase()))
    : projects

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <Navigation />

      {/* Hero */}
      <section className="pt-28 pb-12 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Community <span className="text-orange-400">Showcase</span>
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto mb-8">
            Explore projects built by the PiPilot community. Every project here was created with AI.
          </p>

          {/* Search + Filters */}
          <div className="flex flex-col sm:flex-row items-center gap-3 max-w-2xl mx-auto">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search projects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-10 pl-10 pr-4 rounded-lg bg-gray-900 border border-gray-800 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-orange-500/50"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="h-10 px-3 rounded-lg bg-gray-900 border border-gray-800 text-sm text-gray-300 focus:outline-none focus:border-orange-500/50"
            >
              <option value="recent">Most Recent</option>
              <option value="popular">Most Liked</option>
              <option value="views">Most Viewed</option>
            </select>
          </div>
        </div>
      </section>

      {/* Category Tabs */}
      <section className="px-4 pb-8">
        <div className="max-w-7xl mx-auto flex flex-wrap gap-2 justify-center">
          {CATEGORIES.map(cat => (
            <button
              key={cat.value}
              onClick={() => setCategory(cat.value)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                category === cat.value
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-800/60 text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </section>

      {/* Grid */}
      <section className="px-4 pb-24">
        <div className="max-w-7xl mx-auto">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden animate-pulse">
                  <div className="aspect-video bg-gray-800" />
                  <div className="p-4 space-y-3">
                    <div className="h-4 bg-gray-800 rounded w-3/4" />
                    <div className="h-3 bg-gray-800 rounded w-full" />
                    <div className="h-3 bg-gray-800 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-24">
              <SlidersHorizontal className="w-12 h-12 text-gray-700 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-400 mb-2">No projects found</h3>
              <p className="text-gray-500">
                {search ? 'Try a different search term' : 'Be the first to publish a project!'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filtered.map(project => (
                <div
                  key={project.id}
                  className="group rounded-xl bg-gray-900 border border-gray-800 overflow-hidden hover:border-orange-500/30 transition-all duration-300 hover:shadow-lg hover:shadow-orange-500/5"
                >
                  {/* Thumbnail */}
                  <div
                    className="aspect-video bg-gray-800 relative overflow-hidden cursor-pointer"
                    onClick={() => handleView(project.id, project.live_url)}
                  >
                    {project.thumbnail_url ? (
                      <img
                        src={project.thumbnail_url}
                        alt={project.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-orange-600/20 to-gray-900 flex items-center justify-center">
                        <span className="text-gray-600 text-sm">No preview</span>
                      </div>
                    )}
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="flex items-center gap-2 text-white text-sm font-medium bg-orange-600 px-4 py-2 rounded-lg">
                        <ExternalLink className="w-4 h-4" /> View Site
                      </span>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-100 mb-1 truncate">{project.title}</h3>
                    {project.description && (
                      <p className="text-sm text-gray-400 mb-3 line-clamp-2">{project.description}</p>
                    )}

                    {/* Tech stack */}
                    {project.tech_stack?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {project.tech_stack.slice(0, 3).map(tech => (
                          <Badge key={tech} variant="outline" className="text-[10px] px-1.5 py-0 border-gray-700 text-gray-400">
                            {tech}
                          </Badge>
                        ))}
                        {project.tech_stack.length > 3 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-gray-700 text-gray-400">
                            +{project.tech_stack.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}

                    {/* Stats */}
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <Eye className="w-3.5 h-3.5" /> {project.views || 0}
                        </span>
                        <button
                          onClick={() => handleLike(project.id)}
                          className="flex items-center gap-1 hover:text-orange-400 transition-colors"
                        >
                          <Heart className="w-3.5 h-3.5" /> {project.likes || 0}
                        </button>
                      </div>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-gray-700 text-gray-500">
                        {project.category || 'general'}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  )
}
