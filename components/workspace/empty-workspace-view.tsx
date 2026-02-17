"use client"

import { useState, useEffect } from 'react'
import { ChatInput } from '@/components/chat-input'
import { Button } from '@/components/ui/button'
import { ArrowUp, Star, Sparkles, Filter, SortAsc, SortDesc } from 'lucide-react'
import { ProjectGrid } from '@/components/project-grid'
import { createClient } from '@/lib/supabase/client'
import type { Workspace } from '@/lib/storage-manager'

interface EmptyWorkspaceViewProps {
  onProjectCreated?: (project: Workspace) => void
  onAuthRequired: () => void
  recentProjects?: Array<{
    id: string
    name: string
    description?: string
    lastActivity: string
  }>
}

export function EmptyWorkspaceView({ 
  onProjectCreated, 
  onAuthRequired,
  recentProjects = []
}: EmptyWorkspaceViewProps) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [activeTab, setActiveTab] = useState<'recently' | 'projects'>('projects')
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'activity'>('activity')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [filterBy, setFilterBy] = useState<'all' | 'recent' | 'week' | 'month'>('all')
  const [userProfile, setUserProfile] = useState<{ full_name?: string } | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setIsLoaded(true), 100)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', user.id)
            .single()
          
          setUserProfile(profile)
        }
      } catch (error) {
        console.error('Error fetching user profile:', error)
      }
    }

    fetchUserProfile()
  }, [])

  // Helper function to format user's name with possessive
  const getUserProjectsTitle = () => {
    if (userProfile?.full_name) {
      const fullName = userProfile.full_name.trim()
      // Get just the first word (first name)
      const firstName = fullName.split(' ')[0]
      // Handle names ending with s, x, z, etc. (add ' instead of 's)
      if (firstName.toLowerCase().endsWith('s') || firstName.toLowerCase().endsWith('x') || firstName.toLowerCase().endsWith('z')) {
        return `${firstName}' Projects`
      }
      return `${firstName}'s Projects`
    }
    return "My Projects"
  }

  // Filter and sort projects
  const getFilteredAndSortedProjects = () => {
    let filtered = [...recentProjects]

    // Apply time-based filter
    if (filterBy !== 'all') {
      const now = new Date()
      const filterDate = new Date()

      switch (filterBy) {
        case 'recent':
          filterDate.setHours(now.getHours() - 24) // Last 24 hours
          break
        case 'week':
          filterDate.setDate(now.getDate() - 7) // Last 7 days
          break
        case 'month':
          filterDate.setMonth(now.getMonth() - 1) // Last 30 days
          break
      }

      filtered = filtered.filter(project => 
        new Date(project.lastActivity) >= filterDate
      )
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: string | Date
      let bValue: string | Date

      switch (sortBy) {
        case 'name':
          aValue = a.name.toLowerCase()
          bValue = b.name.toLowerCase()
          break
        case 'date':
          aValue = new Date(a.lastActivity)
          bValue = new Date(b.lastActivity)
          break
        case 'activity':
        default:
          aValue = new Date(a.lastActivity)
          bValue = new Date(b.lastActivity)
          break
      }

      if (sortOrder === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0
      }
    })

    return filtered
  }

  const filteredProjects = getFilteredAndSortedProjects()

  return (
    <div className="h-full flex flex-col">
      {/* Hero Section with Gradient - outside scroll container so dropdowns aren't clipped */}
      <div
        className={`relative z-50 bg-gradient-to-br from-orange-950 via-gray-950 to-gray-900 pt-8 lg:pt-0 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6 transition-all duration-1000 ${
          isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-black/60"></div>

        <div className="relative z-10 w-full max-w-4xl">
          {/* Title */}
            <h1 className="text-2xl sm:text-3xl font-bold text-white text-center mt-6 mb-4 sm:mb-5 tracking-tight leading-tight px-2 sm:px-4">
              Ready to build something amazing?
              <span className="block text-xs sm:text-sm text-orange-300 mt-2 font-normal">Let PiPilot create your next web app in seconds.</span>
            </h1>

          {/* Chat Input Component */}
          <div
            className={`transition-all duration-700 delay-200 ${
              isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
          >
            <ChatInput
              onAuthRequired={onAuthRequired}
              onProjectCreated={onProjectCreated}
            />
          </div>
        </div>
      </div>

      {/* Projects Section - scrollable independently */}
      <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="bg-gray-950 px-4 sm:px-6 py-1 sm:py-2 flex-shrink-0">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-row items-center justify-between mb-2 sm:mb-3 gap-4">
            <div className="flex gap-2 w-full sm:w-auto overflow-x-auto">
              <button
                onClick={() => setActiveTab('projects')}
                className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === 'projects' ? 'bg-orange-600/15 text-orange-400' : 'text-gray-400 hover:text-white'
                }`}
              >
                My projects
              </button>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
              {/* Filter Dropdown */}
              <div className="relative">
                <select
                  value={filterBy}
                  onChange={(e) => setFilterBy(e.target.value as any)}
                  className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="all">All time</option>
                  <option value="recent">Last 24h</option>
                  <option value="week">Last week</option>
                  <option value="month">Last month</option>
                </select>
              </div>

             
              {/* Sort Order Toggle */}
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="p-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
                title={`Sort ${sortOrder === 'asc' ? 'descending' : 'ascending'}`}
              >
                {sortOrder === 'asc' ? <SortAsc size={16} /> : <SortDesc size={16} />}
              </button>

             
            </div>
          </div>

          {/* Project Grid */}
          <ProjectGrid
            filterBy={filterBy}
            sortBy={sortBy}
            sortOrder={sortOrder}
            userProfile={userProfile}
          />
        </div>
      </div>
      </div>
    </div>
  )
}
