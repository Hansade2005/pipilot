"use client"

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Info, Eye, Sparkles, Edit3, Trash2, ShoppingCart, DollarSign, Star, MessageSquare, TrendingUp } from 'lucide-react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { storageManager } from '@/lib/storage-manager'
import { useRouter } from 'next/navigation'
import { useToast } from '@/hooks/use-toast'
import { getExchangeRates, convertUsdToCad, formatPrice } from '@/lib/currency-converter'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

interface PublicTemplate {
  id: string
  name: string
  description: string | null
  thumbnail_url: string | null
  author_name: string | null
  usage_count: number
  files: any
  created_at: string
  preview_url?: string | null
  user_id?: string
}

interface TemplateMetadata {
  template_id: string
  category?: string
  tags?: string[]
  total_sales?: number
  total_revenue?: number
  total_downloads?: number
  rating?: number
  review_count?: number
  featured?: boolean
}

interface TemplatePricing {
  template_id: string
  price: number
  pricing_type: string
  currency: string
  discount_percent?: number
  discount_active?: boolean
}

interface TemplatesViewProps {
  userId?: string
}

export function TemplatesView({ userId }: TemplatesViewProps) {
    // State for editing template
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editName, setEditName] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editThumbnailUrl, setEditThumbnailUrl] = useState('');
    const [editPreviewUrl, setEditPreviewUrl] = useState('');
    const [editTemplateId, setEditTemplateId] = useState<string | null>(null);
    const [isSavingEdit, setIsSavingEdit] = useState(false);
    // State for delete confirmation
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    // State for auth required modal
    const [showAuthRequired, setShowAuthRequired] = useState(false);
  const [templates, setTemplates] = useState<PublicTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTemplate, setSelectedTemplate] = useState<PublicTemplate | null>(null)
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false)
  const [isUsingTemplate, setIsUsingTemplate] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  // Marketplace features state
  const [templateMetadata, setTemplateMetadata] = useState<Map<string, TemplateMetadata>>(new Map())
  const [templatePricing, setTemplatePricing] = useState<Map<string, TemplatePricing>>(new Map())
  const [templateReviews, setTemplateReviews] = useState<Map<string, any[]>>(new Map())
  const [category, setCategory] = useState<string>('')
  const [sortBy, setSortBy] = useState<string>('trending')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [showOnlyPaid, setShowOnlyPaid] = useState(false)
  const [minPrice, setMinPrice] = useState<number>(0)
  const [maxPrice, setMaxPrice] = useState<number>(999)
  const [exchangeRate, setExchangeRate] = useState<number>(1.35) // Default CAD to USD rate

  useEffect(() => {
    // Fetch exchange rates on component mount
    const loadExchangeRates = async () => {
      try {
        const rates = await getExchangeRates()
        setExchangeRate(rates.CAD)
      } catch (error) {
        console.error('Failed to load exchange rates:', error)
        setExchangeRate(1.35) // Fallback rate
      }
    }
    loadExchangeRates()
  }, [])

  useEffect(() => {
    fetchTemplates()
  }, [])

  const fetchTemplates = async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('public_templates')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      setTemplates(data || [])

      // Fetch marketplace metadata and pricing for all templates
      if (data && data.length > 0) {
        const templateIds = data.map((t: any) => t.id)
        
        // Fetch metadata
        const { data: metadataList } = await supabase
          .from('template_metadata')
          .select('*')
          .in('template_id', templateIds)
        
        if (metadataList) {
          const metadataMap = new Map()
          metadataList.forEach((m: any) => metadataMap.set(m.template_id, m))
          setTemplateMetadata(metadataMap)
        }

        // Fetch pricing
        const { data: pricingList } = await supabase
          .from('template_pricing')
          .select('*')
          .in('template_id', templateIds)
        
        if (pricingList) {
          const pricingMap = new Map()
          pricingList.forEach((p: any) => pricingMap.set(p.template_id, p))
          setTemplatePricing(pricingMap)
        }
      }
    } catch (error) {
      console.error('Error fetching templates:', error)
      toast({
        title: 'Error',
        description: 'Failed to load templates',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  // Filter and sort templates
  const filteredAndSortedTemplates = templates.filter(template => {
    // Search filter
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase()
      if (!template.name.toLowerCase().includes(lowerQuery) &&
          !template.description?.toLowerCase().includes(lowerQuery) &&
          !template.author_name?.toLowerCase().includes(lowerQuery)) {
        return false
      }
    }

    // Category filter
    const metadata = templateMetadata.get(template.id)
    if (category && category !== 'all' && metadata?.category !== category) {
      return false
    }

    // Price filter
    const pricing = templatePricing.get(template.id)
    const price = pricing?.price || 0
    if (showOnlyPaid && price === 0) {
      return false
    }
    if (price < minPrice || price > maxPrice) {
      return false
    }

    return true
  }).sort((a, b) => {
    const metaA = templateMetadata.get(a.id)
    const metaB = templateMetadata.get(b.id)
    const priceA = templatePricing.get(a.id)?.price || 0
    const priceB = templatePricing.get(b.id)?.price || 0

    switch (sortBy) {
      case 'newest':
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      case 'price-low':
        return priceA - priceB
      case 'price-high':
        return priceB - priceA
      case 'top-rated':
        return (metaB?.rating || 0) - (metaA?.rating || 0)
      case 'trending':
      default:
        return (metaB?.total_downloads || 0) - (metaA?.total_downloads || 0)
    }
  })

  const handleViewInfo = (template: PublicTemplate) => {
    if (!userId) {
      setShowAuthRequired(true)
      return
    }
    setSelectedTemplate(template)
    fetchTemplateReviews(template.id)
    setIsInfoModalOpen(true)
  }

  const fetchTemplateReviews = async (templateId: string) => {
    try {
      const response = await fetch(`/api/marketplace/templates/${templateId}/reviews`)
      if (response.ok) {
        const data = await response.json()
        setTemplateReviews(new Map(templateReviews).set(templateId, data.reviews || []))
      }
    } catch (error) {
      console.error('Error fetching reviews:', error)
    }
  }

  const handlePurchase = async (template: PublicTemplate) => {
    if (!userId) {
      setShowAuthRequired(true)
      return
    }

    const pricing = templatePricing.get(template.id)
    if (!pricing) {
      toast({
        title: 'Error',
        description: 'Template pricing not found',
        variant: 'destructive'
      })
      return
    }

    try {
      const response = await fetch('/api/marketplace/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: template.id })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Purchase failed')
      }

      const result = await response.json()

      if (result.access_granted) {
        // Free template - access granted immediately
        toast({
          title: 'Success',
          description: `You now have access to ${template.name}!`,
        })
        // Close modal and redirect to use template
        setIsInfoModalOpen(false)
        handleUseTemplate(template)
      } else if (result.checkout_url) {
        // Paid template - redirect to Stripe checkout
        window.location.href = result.checkout_url
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to purchase template',
        variant: 'destructive'
      })
    }
  }

  const handleUseTemplate = async (template: PublicTemplate) => {
    if (!userId) {
      setShowAuthRequired(true)
      return
    }

    setIsUsingTemplate(true)

    try {
      const supabase = createClient()

      // Increment usage count
      await supabase.rpc('increment_template_usage', { template_id: template.id })

      // Create new project from template
      await storageManager.init()
      
      const slug = template.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      
      const workspace = await storageManager.createWorkspace({
        name: template.name,
        description: template.description || undefined,
        userId: userId,
        isPublic: false,
        isTemplate: false,
        lastActivity: new Date().toISOString(),
        deploymentStatus: 'not_deployed',
        slug
      })

      // Get template files - check if stored in Supabase Storage
      let templateFiles: any[] = []
      
      if (workspace && template.files) {
        if (template.files.storageUrl) {
          // Download template data from Supabase Storage
          console.log('Downloading template from storage:', template.files.storageUrl)
          const response = await fetch(template.files.storageUrl)
          if (!response.ok) {
            throw new Error(`Failed to download template: ${response.statusText}`)
          }
          const templateData = await response.json()
          templateFiles = templateData.files || []
          console.log(`Downloaded ${templateFiles.length} files from storage`)
        } else if (Array.isArray(template.files)) {
          // Legacy format - files stored directly in database
          templateFiles = template.files
          console.log(`Using ${templateFiles.length} files from legacy database format`)
        }
        
        // Create files in the new workspace
        for (const file of templateFiles) {
          await storageManager.createFile({
            workspaceId: workspace.id,
            name: file.name,
            content: file.content,
            path: file.path || '/',
            type: file.type || 'file',
            fileType: file.fileType || 'text',
            size: file.content?.length || 0,
            isDirectory: false
          })
        }
      }

      toast({
        title: 'Success',
        description: `Project created from template: ${template.name}`,
      })

      // Close modal and redirect
      setIsInfoModalOpen(false)
      
      // Navigate to the new project
      const params = new URLSearchParams()
      params.set('projectId', workspace.id)
      params.set('newProject', workspace.id)
      router.push(`/workspace?${params.toString()}`)

    } catch (error) {
      console.error('Error using template:', error)
      toast({
        title: 'Error',
        description: 'Failed to create project from template',
        variant: 'destructive'
      })
    } finally {
      setIsUsingTemplate(false)
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading templates...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-[#030305]">
      {/* Header Section */}
      <div className="relative bg-gradient-to-br from-orange-950/40 via-[#030305] to-gray-900/30 py-12 px-4 sm:px-6 lg:px-8 border-b border-white/5">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/10 to-black/30"></div>
        
        <div className="relative z-10 max-w-7xl mx-auto">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="text-center flex-1">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-2 flex items-center justify-center gap-2 sm:gap-3 whitespace-nowrap">
                <Sparkles className="h-6 w-6 sm:h-8 sm:w-8" />
                Template Marketplace
              </h1>
              <p className="hidden sm:block text-white/80 text-lg max-w-2xl mx-auto">
                Browse, purchase, and explore premium templates from our creator community
              </p>
            </div>
            <Button
              onClick={() => {
                const params = new URLSearchParams(window.location.search)
                params.set('view', 'template-earnings')
                window.location.href = `/workspace?${params.toString()}`
              }}
              className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-orange-500/50 backdrop-blur-md text-white font-semibold gap-2 whitespace-nowrap transition-all"
            >
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">My Earnings</span>
              <span className="sm:hidden">Earnings</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Filters & Search Section */}
      <Accordion type="single" collapsible className="bg-[#0d1117]/80 border-b border-white/5 sticky top-0 z-20 backdrop-blur-md">
        <AccordionItem value="filters" className="border-none">
          <AccordionTrigger className="px-4 sm:px-6 py-4 hover:no-underline">
            <div className="flex items-center gap-2 text-white font-medium">
              <Sparkles className="h-4 w-4" />
              Search & Filter Templates
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 sm:px-6 pb-4">
            <div className="space-y-4">
              {/* Currency Indicator */}
              <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-orange-500/30 rounded-lg text-xs text-orange-200 w-fit backdrop-blur-sm">
                <span>
                  💵 Prices in <strong>CAD</strong> • 1 USD = ${exchangeRate.toFixed(2)} CAD
                </span>
              </div>

              {/* Search Bar */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Search templates by name, description, or creator..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 px-4 py-2 rounded-lg bg-[#0d1117] border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all"
                />
              </div>

              {/* Filter and Sort Controls */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Category Filter */}
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="bg-[#0d1117] border-white/10 text-white hover:border-orange-500/50 transition-all">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0d1117] border-white/10">
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="Dashboard">Dashboard</SelectItem>
                    <SelectItem value="E-Commerce">E-Commerce</SelectItem>
                    <SelectItem value="Portfolio">Portfolio</SelectItem>
                    <SelectItem value="AI">AI Tools</SelectItem>
                    <SelectItem value="SaaS">SaaS</SelectItem>
                    <SelectItem value="Business">Business</SelectItem>
                  </SelectContent>
                </Select>

                {/* Sort Filter */}
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="bg-[#0d1117] border-white/10 text-white hover:border-orange-500/50 transition-all">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0d1117] border-white/10">
                    <SelectItem value="trending">Trending</SelectItem>
                    <SelectItem value="newest">Newest</SelectItem>
                    <SelectItem value="price-low">Price: Low to High</SelectItem>
                    <SelectItem value="price-high">Price: High to Low</SelectItem>
                    <SelectItem value="top-rated">Top Rated</SelectItem>
                  </SelectContent>
                </Select>

                {/* Price Range Min */}
                <input
                  type="number"
                  placeholder="Min price"
                  value={minPrice}
                  onChange={(e) => setMinPrice(Number(e.target.value))}
                  className="px-3 py-2 rounded-lg bg-[#0d1117] border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all"
                />

                {/* Price Range Max */}
                <input
                  type="number"
                  placeholder="Max price"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(Number(e.target.value))}
                  className="px-3 py-2 rounded-lg bg-[#0d1117] border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all"
                />
              </div>

              {/* Paid Only Checkbox */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="paidOnly"
                  checked={showOnlyPaid}
                  onChange={(e) => setShowOnlyPaid(e.target.checked)}
                  className="rounded border-gray-600"
                />
                <label htmlFor="paidOnly" className="text-sm text-white/80">Show only paid templates</label>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Templates Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {filteredAndSortedTemplates.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">📦</div>
            <h3 className="text-xl font-semibold text-white mb-2">No Templates Found</h3>
            <p className="text-white/60">Try adjusting your filters or search query</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAndSortedTemplates.map((template) => {
              const isOwner = template.user_id === userId;
              const metadata = templateMetadata.get(template.id)
              const pricing = templatePricing.get(template.id)
              const reviews = templateReviews.get(template.id) || []
              return (
                <Card key={template.id} className="bg-[#0d1117] border-white/10 hover:border-orange-500/30 transition-all duration-300 overflow-hidden group relative hover:shadow-lg hover:shadow-orange-500/10">
                  {/* Edit/Delete Icon Buttons (top left) */}
                  {isOwner && (
                    <div className="absolute top-3 left-3 flex gap-2 z-10">
                      <button
                        title="Edit Template"
                        onClick={e => {
                          e.stopPropagation();
                          setEditTemplateId(template.id);
                          setEditName(template.name);
                          setEditDescription(template.description || '');
                          setEditThumbnailUrl(template.thumbnail_url || '');
                          setEditPreviewUrl(template.preview_url || '');
                          setIsEditModalOpen(true);
                        }}
                        className="p-2 bg-yellow-500/90 hover:bg-yellow-600 text-white rounded-full shadow-lg transition-all duration-200"
                        style={{ lineHeight: 0 }}
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        title="Delete Template"
                        onClick={e => {
                          e.stopPropagation();
                          setDeleteTemplateId(template.id);
                          setIsDeleteModalOpen(true);
                        }}
                        className="p-2 bg-red-500/90 hover:bg-red-600 text-white rounded-full shadow-lg transition-all duration-200"
                        style={{ lineHeight: 0 }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Price Badge (top right) */}
                  {pricing && (
                    <div className="absolute top-3 right-3 z-10">
                      {pricing.price === 0 ? (
                        <Badge className='bg-green-500/90 text-white'>Free</Badge>
                      ) : (
                        <Badge className='bg-orange-500/90 text-white'>
                          {formatPrice(convertUsdToCad(pricing.price, exchangeRate), 'CAD')}
                        </Badge>
                      )}
                    </div>
                  )}

                  <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-orange-950/20 via-[#030305] to-gray-900/20">
                    {template.thumbnail_url ? (
                      <Image
                        src={template.thumbnail_url}
                        alt={template.name}
                        fill
                        className="object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/40 text-6xl">
                        📄
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                    
                    {/* Stats badges */}
                    <div className="absolute bottom-3 left-3 flex gap-2 flex-wrap">
                      {metadata?.total_downloads && (
                        <Badge variant="secondary" className="bg-white/90 backdrop-blur-sm text-gray-900 text-xs">
                          <TrendingUp className="w-3 h-3 mr-1" />
                          {metadata.total_downloads} downloads
                        </Badge>
                      )}
                      {metadata?.rating && (
                        <Badge variant="secondary" className="bg-white/90 backdrop-blur-sm text-gray-900 text-xs">
                          <Star className="w-3 h-3 mr-1" />
                          {metadata.rating.toFixed(1)}
                        </Badge>
                      )}
                      {metadata?.featured && (
                        <Badge className="bg-yellow-500/90 text-white text-xs">Featured</Badge>
                      )}
                    </div>
                  </div>

                  <CardContent className="p-5 bg-gradient-to-b from-white/5 to-[#0d1117]">
                    <h3 className="text-white font-bold text-lg mb-1 line-clamp-1">
                      {template.name}
                    </h3>
                    {metadata?.category && (
                      <Badge variant="outline" className="mb-2 text-xs border-orange-500/30 text-orange-300">{metadata.category}</Badge>
                    )}
                    <p className="text-white/60 text-sm line-clamp-2 mb-3">
                      {template.description || 'No description provided'}
                    </p>
                    <div className="text-xs text-white/50 mb-4">
                      by {template.author_name || 'Anonymous'}
                    </div>

                    {/* Review Count */}
                    {metadata?.review_count && (
                      <div className="flex items-center gap-1 text-xs text-white/60 mb-3">
                        <MessageSquare className="w-3 h-3" />
                        {metadata.review_count} review{metadata.review_count !== 1 ? 's' : ''}
                      </div>
                    )}

                    <div className="flex flex-col gap-2">
                      <Button
                        onClick={() => handlePurchase(template)}
                        className="w-full bg-orange-600 hover:bg-orange-500 text-white transition-all shadow-lg shadow-orange-500/20"
                        size="sm"
                      >
                        <ShoppingCart className="h-4 w-4 mr-1" />
                        {pricing?.price === 0 ? 'Get Access' : `Purchase - ${formatPrice(convertUsdToCad(pricing?.price || 0, exchangeRate), 'CAD')}`}
                      </Button>
                      {template.preview_url ? (
                        <Button
                          asChild
                          className="w-full bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white transition-all"
                          size="sm"
                        >
                          <a href={template.preview_url} target="_blank" rel="noopener noreferrer">
                            <Eye className="h-4 w-4 mr-1" />
                            Preview
                          </a>
                        </Button>
                      ) : (
                        <Button
                          className="w-full bg-white/5 border border-white/10 text-white/50 cursor-not-allowed"
                          size="sm"
                          disabled
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Preview
                        </Button>
                      )}
                      <Button
                        onClick={() => handleViewInfo(template)}
                        variant="outline"
                        size="sm"
                        className="w-full border-white/20 text-white bg-white hover:bg-white/10 hover:border-white/30 hover:text-white"
                      >
                        <Info className="h-4 w-4 mr-1" />
                        Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
                <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
                  <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-md">
                    <DialogHeader>
                      <DialogTitle>Edit Template</DialogTitle>
                      <DialogDescription>Edit your template details below.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm mb-1">Name</label>
                        <input
                          className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          disabled={isSavingEdit}
                        />
                      </div>
                      <div>
                        <label className="block text-sm mb-1">Description</label>
                        <textarea
                          className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white"
                          value={editDescription}
                          onChange={e => setEditDescription(e.target.value)}
                          disabled={isSavingEdit}
                        />
                      </div>
                      <div>
                        <label className="block text-sm mb-1">Thumbnail URL</label>
                        <input
                          className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white"
                          value={editThumbnailUrl}
                          onChange={e => setEditThumbnailUrl(e.target.value)}
                          disabled={isSavingEdit}
                          placeholder="https://example.com/thumbnail.jpg"
                          type="url"
                        />
                      </div>
                      <div>
                        <label className="block text-sm mb-1">Preview URL</label>
                        <input
                          className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white"
                          value={editPreviewUrl}
                          onChange={e => setEditPreviewUrl(e.target.value)}
                          disabled={isSavingEdit}
                          placeholder="https://your-demo-url.com"
                          type="url"
                        />
                      </div>
                    </div>
                    <DialogFooter className="gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setIsEditModalOpen(false)}
                        disabled={isSavingEdit}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={async () => {
                          if (!editTemplateId) return;
                          setIsSavingEdit(true);
                          try {
                            const supabase = createClient();
                            const { error } = await supabase
                              .from('public_templates')
                              .update({
                                name: editName,
                                description: editDescription,
                                thumbnail_url: editThumbnailUrl,
                                preview_url: editPreviewUrl
                              })
                              .eq('id', editTemplateId)
                              .eq('user_id', userId);
                            if (error) throw error;
                            toast({ title: 'Template updated', description: 'Your template was updated.' });
                            setIsEditModalOpen(false);
                            setEditTemplateId(null);
                            fetchTemplates();
                          } catch (error) {
                            toast({ title: 'Error', description: 'Failed to update template', variant: 'destructive' });
                          } finally {
                            setIsSavingEdit(false);
                          }
                        }}
                        disabled={isSavingEdit || !editName.trim()}
                      >
                        {isSavingEdit ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {/* Delete Template Modal */}
                <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
                  <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-md">
                    <DialogHeader>
                      <DialogTitle>Delete Template</DialogTitle>
                      <DialogDescription>Are you sure you want to delete this template? This action cannot be undone.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setIsDeleteModalOpen(false)}
                        disabled={isDeleting}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={async () => {
                          if (!deleteTemplateId) return;
                          setIsDeleting(true);
                          try {
                            const supabase = createClient();
                            const { error } = await supabase
                              .from('public_templates')
                              .delete()
                              .eq('id', deleteTemplateId)
                              .eq('user_id', userId);
                            if (error) throw error;
                            toast({ title: 'Template deleted', description: 'Your template was deleted.' });
                            setIsDeleteModalOpen(false);
                            setDeleteTemplateId(null);
                            fetchTemplates();
                          } catch (error) {
                            toast({ title: 'Error', description: 'Failed to delete template', variant: 'destructive' });
                          } finally {
                            setIsDeleting(false);
                          }
                        }}
                        disabled={isDeleting}
                      >
                        {isDeleting ? 'Deleting...' : 'Delete'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {/* Template Info Modal */}
                <Dialog open={isInfoModalOpen} onOpenChange={setIsInfoModalOpen}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-2xl max-h-[600px] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="text-2xl">{selectedTemplate?.name}</DialogTitle>
            <DialogDescription className="text-gray-400">
              Template Information
            </DialogDescription>
          </DialogHeader>
          
          {selectedTemplate && (
            <div className="space-y-4 overflow-y-auto flex-1 pr-2">
              {selectedTemplate.thumbnail_url && (
                <div className="relative aspect-video rounded-lg overflow-hidden">
                  <Image
                    src={selectedTemplate.thumbnail_url}
                    alt={selectedTemplate.name}
                    fill
                    className="object-cover"
                  />
                </div>
              )}
              
              <div className="space-y-3">
                <div>
                  <h4 className="text-sm font-semibold text-gray-400 mb-1">Description</h4>
                  <p className="text-white">{selectedTemplate.description || 'No description provided'}</p>
                </div>
                {selectedTemplate.preview_url && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-400 mb-1">Preview URL</h4>
                    <a
                      href={selectedTemplate.preview_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-orange-400 underline break-all"
                    >
                      {selectedTemplate.preview_url}
                    </a>
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-400 mb-1">Created By</h4>
                    <p className="text-white">{selectedTemplate.author_name || 'Anonymous'}</p>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-semibold text-gray-400 mb-1">Times Used</h4>
                    <p className="text-white">{selectedTemplate.usage_count || 0}</p>
                  </div>
                </div>
                
                <div>
                  <h4 className="text-sm font-semibold text-gray-400 mb-1">Created</h4>
                  <p className="text-white">{new Date(selectedTemplate.created_at).toLocaleDateString()}</p>
                </div>

                {/* Reviews Section */}
                {selectedTemplate && templateReviews.get(selectedTemplate.id) && templateReviews.get(selectedTemplate.id)!.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-400 mb-2">Recent Reviews</h4>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {templateReviews.get(selectedTemplate.id)!.slice(0, 3).map((review: any) => (
                        <div key={review.id} className="bg-white/5 p-2 rounded text-xs">
                          <div className="flex items-center gap-1 mb-1">
                            <div className="flex">
                              {[...Array(5)].map((_, i) => (
                                <Star
                                  key={i}
                                  className={`w-3 h-3 ${i < review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}`}
                                />
                              ))}
                            </div>
                            <span className="text-white/60 ml-auto">
                              {review.profiles?.username || 'Anonymous'}
                            </span>
                          </div>
                          <p className="text-white/80">{review.review_text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          
          <DialogFooter className="flex-shrink-0 gap-2">
            <Button
              variant="outline"
              onClick={() => setIsInfoModalOpen(false)}
              className="border-gray-600 text-gray-300 hover:bg-gray-800"
            >
              Close
            </Button>
            <div className="flex w-full gap-2">
              <Button
                onClick={() => selectedTemplate && handlePurchase(selectedTemplate)}
                disabled={isUsingTemplate}
                className="flex-1 bg-orange-600 hover:bg-orange-500"
              >
                <ShoppingCart className="h-4 w-4 mr-1" />
                {isUsingTemplate ? 'Processing...' : (templatePricing.get(selectedTemplate?.id || '')?.price === 0 ? 'Get Access' : `Purchase - ${formatPrice(convertUsdToCad(templatePricing.get(selectedTemplate?.id || '')?.price || 0, exchangeRate), 'CAD')}`)}
              </Button>
              <Button
                asChild
                className="flex-1 bg-green-600 hover:bg-green-700"
                disabled={!selectedTemplate?.preview_url}
              >
                {selectedTemplate?.preview_url ? (
                  <a href={selectedTemplate.preview_url!} target="_blank" rel="noopener noreferrer">Preview</a>
                ) : (
                  'View Preview'
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auth Required Modal */}
      <Dialog open={showAuthRequired} onOpenChange={setShowAuthRequired}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>Sign In Required</DialogTitle>
            <DialogDescription>You need to sign in to access this feature</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-white/80 mb-6">
              To purchase, view details, or start a new project from a template, please sign in to your account.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowAuthRequired(false)}
              className="border-gray-600 text-black hover:transition-all duration-300 cursor-pointer"
            >
              Continue Browsing
            </Button>
            <Button
              onClick={() => router.push('/auth')}
              className="bg-orange-600 hover:bg-orange-500"
            >
              Sign In / Sign Up
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
