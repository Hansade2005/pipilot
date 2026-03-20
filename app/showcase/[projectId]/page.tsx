"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { ExternalLink, Heart, Eye, ArrowLeft, Share2, Calendar, Globe } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { usePageTitle } from '@/hooks/use-page-title'

interface ShowcaseProject {
  id: string
  title: string
  description: string
  category: string
  thumbnail_url: string
  live_url: string
  preview_url: string
  tech_stack: string[]
  views: number
  likes: number
  created_at: string
  user_id: string
}

export default function ShowcaseProjectPage() {
  usePageTitle('Showcase Project')
  const params = useParams()
  const router = useRouter()
  const projectId = params.projectId as string

  const [project, setProject] = useState<ShowcaseProject | null>(null)
  const [loading, setLoading] = useState(true)
  const [liked, setLiked] = useState(false)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    fetchProject()
    trackView()
  }, [projectId])

  const fetchProject = async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('showcase_projects')
        .select('*')
        .eq('id', projectId)
        .single()

      if (error || !data) {
        // Try by project_id too
        const { data: byProjectId } = await supabase
          .from('showcase_projects')
          .select('*')
          .eq('project_id', projectId)
          .single()

        if (byProjectId) {
          setProject(byProjectId)
        } else {
          toast.error('Project not found')
          router.push('/showcase')
        }
      } else {
        setProject(data)
      }
    } catch {
      toast.error('Failed to load project')
    } finally {
      setLoading(false)
    }
  }

  const trackView = () => {
    fetch('/api/showcase', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, action: 'view' })
    }).catch(() => {})
  }

  const handleLike = async () => {
    if (liked) return
    try {
      const res = await fetch('/api/showcase', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: project?.id, action: 'like' })
      })
      const data = await res.json()
      if (data.success) {
        setProject(prev => prev ? { ...prev, likes: data.likes } : prev)
        setLiked(true)
        toast.success('Liked!')
      }
    } catch {}
  }

  const handleShare = () => {
    const url = window.location.href
    if (navigator.share) {
      navigator.share({ title: project?.title, url })
    } else {
      navigator.clipboard.writeText(url)
      toast.success('Link copied!')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100">
        <Navigation />
        <div className="pt-28 pb-24 px-4 max-w-6xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-64 bg-gray-800 rounded" />
            <div className="aspect-video bg-gray-800 rounded-xl" />
            <div className="h-4 w-full bg-gray-800 rounded" />
            <div className="h-4 w-2/3 bg-gray-800 rounded" />
          </div>
        </div>
      </div>
    )
  }

  if (!project) return null

  const formattedDate = new Date(project.created_at).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  })

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <Navigation />

      <div className="pt-24 pb-24 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Back + Title */}
          <div className="mb-6">
            <button
              onClick={() => router.push('/showcase')}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-orange-400 transition-colors mb-4"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Showcase
            </button>
            <h1 className="text-3xl md:text-4xl font-bold">{project.title}</h1>
            {project.description && (
              <p className="text-gray-400 text-lg mt-2 max-w-3xl">{project.description}</p>
            )}
          </div>

          {/* Meta bar */}
          <div className="flex flex-wrap items-center gap-4 mb-6 text-sm text-gray-500">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" /> {formattedDate}
            </span>
            <span className="flex items-center gap-1.5">
              <Eye className="w-4 h-4" /> {project.views || 0} views
            </span>
            <span className="flex items-center gap-1.5">
              <Heart className="w-4 h-4" /> {project.likes || 0} likes
            </span>
            <Badge variant="outline" className="border-gray-700 text-gray-400 text-xs">
              {project.category || 'general'}
            </Badge>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3 mb-8">
            <a
              href={project.live_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-medium rounded-lg transition-colors"
            >
              <Globe className="w-4 h-4" /> Visit Live Site
            </a>
            <button
              onClick={handleLike}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-colors ${
                liked
                  ? 'bg-orange-600/20 text-orange-400 border border-orange-500/30'
                  : 'bg-gray-800 text-gray-300 hover:text-orange-400 hover:bg-gray-700 border border-gray-700'
              }`}
            >
              <Heart className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />
              {liked ? 'Liked' : 'Like'} ({project.likes || 0})
            </button>
            <button
              onClick={handleShare}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-800 text-gray-300 hover:text-gray-100 hover:bg-gray-700 rounded-lg font-medium border border-gray-700 transition-colors"
            >
              <Share2 className="w-4 h-4" /> Share
            </button>
          </div>

          {/* Screenshot / Preview */}
          <div className="rounded-xl overflow-hidden border border-gray-800 mb-8">
            {project.thumbnail_url ? (
              <img
                src={project.thumbnail_url}
                alt={project.title}
                className="w-full object-cover"
              />
            ) : (
              <div className="aspect-video bg-gradient-to-br from-orange-600/20 to-gray-900 flex items-center justify-center">
                <span className="text-gray-500">No preview available</span>
              </div>
            )}
          </div>

          {/* Live iframe preview */}
          {project.live_url && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">Live Preview</h2>
                <a
                  href={project.live_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-orange-400 hover:text-orange-300"
                >
                  Open in new tab <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
              <div className="rounded-xl overflow-hidden border border-gray-800 bg-white">
                <iframe
                  src={project.live_url}
                  className="w-full h-[600px]"
                  title={project.title}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                />
              </div>
            </div>
          )}

          {/* Tech stack */}
          {project.tech_stack?.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Tech Stack</h2>
              <div className="flex flex-wrap gap-2">
                {project.tech_stack.map(tech => (
                  <Badge
                    key={tech}
                    variant="outline"
                    className="px-3 py-1 text-sm border-gray-700 text-gray-300"
                  >
                    {tech}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  )
}
