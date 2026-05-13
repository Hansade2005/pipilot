"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Key,
  Plus,
  Copy,
  Trash2,
  Eye,
  EyeOff,
  Server,
  TrendingUp,
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Clock,
  BarChart3,
  Shield,
  Globe,
  Activity,
  ExternalLink,
  BookOpen,
  RefreshCw,
  Play,
  Search,
  FileText,
  Brain,
  ChevronDown,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"
import { STRIPE_API_PLANS } from "@/config/stripe-api-plans"
import { useRouter } from "next/navigation"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"

const BASE_URL = "https://pipilot-search-api.hanscadx8.workers.dev"

interface ApiKey {
  id: string
  name: string
  key: string
  key_prefix: string
  created_at: string
  last_used_at: string | null
  requests_count: number
  tier: string
}

type CodeTab = "curl" | "typescript" | "python"

const quickStartExamples: Record<CodeTab, string> = {
  curl: `curl -X POST ${BASE_URL}/search \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "AI news", "maxResults": 5, "rerank": true}'`,
  typescript: `const res = await fetch('${BASE_URL}/search', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query: 'AI news',
    maxResults: 5,
    rerank: true,
  }),
});

const data = await res.json();
console.log(data.results);`,
  python: `import requests

res = requests.post(
    '${BASE_URL}/search',
    headers={
        'Authorization': 'Bearer YOUR_API_KEY',
        'Content-Type': 'application/json',
    },
    json={
        'query': 'AI news',
        'maxResults': 5,
        'rerank': True,
    },
)

data = res.json()
print(data['results'])`,
}

export default function ApiDashboardPage() {
  const router = useRouter()
  const supabase = createClient()

  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [currentTier, setCurrentTier] = useState('free')
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])

  // Quota status
  const [quotaUsed, setQuotaUsed] = useState(0)
  const [quotaLimit, setQuotaLimit] = useState(10000)
  const [quotaLoading, setQuotaLoading] = useState(true)

  // API status
  const [apiStatus, setApiStatus] = useState<'online' | 'degraded' | 'offline'>('online')

  // Key generation
  const [showNewKeyDialog, setShowNewKeyDialog] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)
  const [generatingKey, setGeneratingKey] = useState(false)

  // Key visibility
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set())

  // Quick start code tab
  const [codeTab, setCodeTab] = useState<CodeTab>("curl")

  // Copied state
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Playground state
  type PlaygroundEndpoint = "search" | "extract" | "smart-search"
  const [pgEndpoint, setPgEndpoint] = useState<PlaygroundEndpoint>("search")
  const [pgQuery, setPgQuery] = useState("")
  const [pgUrl, setPgUrl] = useState("")
  const [pgMaxResults, setPgMaxResults] = useState("5")
  const [pgRerank, setPgRerank] = useState(true)
  const [pgDepth, setPgDepth] = useState<"quick" | "normal" | "deep">("normal")
  const [pgRunning, setPgRunning] = useState(false)
  const [pgResult, setPgResult] = useState<any>(null)
  const [pgError, setPgError] = useState<string | null>(null)
  const [pgLatency, setPgLatency] = useState<number | null>(null)
  const [pgSelectedKey, setPgSelectedKey] = useState<string>("")

  useEffect(() => {
    checkUser()
  }, [])

  const checkUser = async () => {
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      router.push('/auth/login?redirect=/dashboard/api')
      return
    }

    setUser(user)
    await fetchUserSubscription(user.id)
    await fetchApiKeys(user.id)
    await fetchQuotaStatus()
    setLoading(false)
  }

  const fetchUserSubscription = async (userId: string) => {
    try {
      const response = await fetch(`/api/subscription/current`)
      const data = await response.json()

      if (data.tier) {
        setCurrentTier(data.tier)
        const planConfig = STRIPE_API_PLANS[data.tier as keyof typeof STRIPE_API_PLANS]
        if (planConfig) {
          setQuotaLimit(planConfig.requests)
        }
      } else {
        setCurrentTier('free')
        setQuotaLimit(10000)
      }
    } catch (err) {
      console.error('Error fetching subscription:', err)
      setCurrentTier('free')
      setQuotaLimit(10000)
    }
  }

  const fetchApiKeys = async (userId: string) => {
    try {
      const response = await fetch('/api/keys/list')
      const data = await response.json()

      if (data.keys) {
        setApiKeys(data.keys)
      }
    } catch (err) {
      console.error('Error fetching API keys:', err)
    }
  }

  const fetchQuotaStatus = async () => {
    try {
      const response = await fetch(`${BASE_URL}/health`)
      const data = await response.json()

      if (data.quota) {
        setQuotaUsed(data.quota.used)
      }
      setApiStatus('online')
      setQuotaLoading(false)
    } catch (err) {
      console.error('Error fetching quota:', err)
      setApiStatus('offline')
      setQuotaLoading(false)
    }
  }

  const generateApiKey = async () => {
    if (!newKeyName.trim()) {
      alert('Please enter a key name')
      return
    }

    setGeneratingKey(true)

    try {
      const response = await fetch('/api/keys/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newKeyName,
          tier: currentTier
        })
      })

      const data = await response.json()

      if (data.error) {
        alert(data.error)
        return
      }

      setGeneratedKey(data.apiKey)
      setNewKeyName('')
      await fetchApiKeys(user.id)

    } catch (err: any) {
      console.error('Error generating key:', err)
      alert('Failed to generate API key')
    } finally {
      setGeneratingKey(false)
    }
  }

  const copyToClipboard = (text: string, id?: string) => {
    navigator.clipboard.writeText(text)
    if (id) {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    }
  }

  const toggleKeyVisibility = (keyId: string) => {
    const newVisible = new Set(visibleKeys)
    if (newVisible.has(keyId)) {
      newVisible.delete(keyId)
    } else {
      newVisible.add(keyId)
    }
    setVisibleKeys(newVisible)
  }

  const revokeKey = async (apiKey: string) => {
    if (!confirm('Are you sure you want to revoke this API key? This action cannot be undone.')) {
      return
    }

    try {
      await fetch(`/api/keys/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyId: apiKey })
      })

      await fetchApiKeys(user.id)
    } catch (err) {
      console.error('Error revoking key:', err)
      alert('Failed to revoke API key')
    }
  }

  const runPlayground = async () => {
    const keyToUse = pgSelectedKey || apiKeys[0]?.key
    if (!keyToUse) {
      setPgError("No API key available. Generate one first.")
      return
    }
    if (pgEndpoint === "extract" && !pgUrl.trim()) {
      setPgError("Please enter a URL to extract.")
      return
    }
    if (pgEndpoint !== "extract" && !pgQuery.trim()) {
      setPgError("Please enter a search query.")
      return
    }

    setPgRunning(true)
    setPgResult(null)
    setPgError(null)
    setPgLatency(null)

    const start = performance.now()

    try {
      let body: any = {}
      if (pgEndpoint === "search") {
        body = { query: pgQuery.trim(), maxResults: parseInt(pgMaxResults) || 5, rerank: pgRerank }
      } else if (pgEndpoint === "extract") {
        body = { url: pgUrl.trim() }
      } else {
        body = { query: pgQuery.trim(), depth: pgDepth }
      }

      const res = await fetch(`${BASE_URL}/${pgEndpoint}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${keyToUse}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })

      const elapsed = Math.round(performance.now() - start)
      setPgLatency(elapsed)

      const data = await res.json()

      if (!res.ok) {
        setPgError(data.error || `HTTP ${res.status}`)
      } else {
        setPgResult(data)
      }
    } catch (err: any) {
      setPgLatency(Math.round(performance.now() - start))
      setPgError(err.message || "Request failed")
    } finally {
      setPgRunning(false)
    }
  }

  const currentPlan = STRIPE_API_PLANS[currentTier as keyof typeof STRIPE_API_PLANS]
  const quotaPercentage = quotaLimit > 0 ? Math.round((quotaUsed / quotaLimit) * 100) : 0

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-orange-500 animate-spin" />
          <p className="text-gray-400 text-sm">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <Navigation />

      {/* Header */}
      <div className="border-b border-gray-800/60 bg-gray-950/80 backdrop-blur-sm pt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl md:text-3xl font-bold text-white">Search API Dashboard</h1>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${
                    apiStatus === 'online' ? 'bg-green-500 animate-pulse' :
                    apiStatus === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'
                  }`} />
                  <span className={`text-xs font-medium ${
                    apiStatus === 'online' ? 'text-green-400' :
                    apiStatus === 'degraded' ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {apiStatus === 'online' ? 'Operational' :
                     apiStatus === 'degraded' ? 'Degraded' : 'Offline'}
                  </span>
                </div>
              </div>
              <p className="text-gray-400">
                {user?.email} &middot; {currentPlan?.name} plan
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                className="border-gray-700 text-gray-300 hover:text-orange-400 hover:border-orange-500/50 hover:bg-orange-500/10"
                asChild
              >
                <Link href="/api">
                  <BookOpen className="mr-2 w-4 h-4" />
                  API Docs
                </Link>
              </Button>
              <Button
                className="bg-orange-600 hover:bg-orange-500 text-white shadow-lg shadow-orange-500/20"
                onClick={() => setShowNewKeyDialog(true)}
              >
                <Plus className="mr-2 w-4 h-4" />
                New API Key
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Current Plan */}
          <Card className="bg-gray-900/80 border-gray-800/60 p-5 hover:border-orange-500/30 transition-all duration-300">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Plan</span>
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <Server className="w-4 h-4 text-orange-400" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">{currentPlan?.name}</span>
              {currentPlan?.price !== null && currentPlan?.price !== undefined && (
                <span className="text-sm text-gray-500">${currentPlan?.price}/mo</span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">{currentPlan?.rateLimit}</p>
            {currentTier === 'free' && (
              <Button
                size="sm"
                className="w-full mt-3 bg-orange-600 hover:bg-orange-500 text-white text-xs h-8"
                asChild
              >
                <Link href="/api#pricing">
                  Upgrade
                  <ArrowRight className="ml-1 w-3 h-3" />
                </Link>
              </Button>
            )}
          </Card>

          {/* Monthly Usage */}
          <Card className="bg-gray-900/80 border-gray-800/60 p-5 hover:border-orange-500/30 transition-all duration-300">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Usage</span>
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-orange-400" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">{quotaUsed.toLocaleString()}</span>
              <span className="text-sm text-gray-500">/ {quotaLimit.toLocaleString()}</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2 mt-3 mb-1">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${
                  quotaPercentage > 90 ? 'bg-red-500' :
                  quotaPercentage > 70 ? 'bg-yellow-500' :
                  'bg-orange-500'
                }`}
                style={{ width: `${Math.min(quotaPercentage, 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500">{quotaPercentage}% of monthly quota</p>
          </Card>

          {/* Active Keys */}
          <Card className="bg-gray-900/80 border-gray-800/60 p-5 hover:border-orange-500/30 transition-all duration-300">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">API Keys</span>
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <Key className="w-4 h-4 text-orange-400" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">{apiKeys.length}</span>
              <span className="text-sm text-gray-500">active</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {apiKeys.length === 0 ? 'No keys generated' : `${apiKeys.reduce((sum, k) => sum + (k.requests_count || 0), 0).toLocaleString()} total requests`}
            </p>
          </Card>

          {/* API Status */}
          <Card className="bg-gray-900/80 border-gray-800/60 p-5 hover:border-orange-500/30 transition-all duration-300">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Status</span>
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <Activity className="w-4 h-4 text-orange-400" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${
                apiStatus === 'online' ? 'bg-green-500' :
                apiStatus === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'
              }`} />
              <span className="text-2xl font-bold text-white">
                {apiStatus === 'online' ? 'Healthy' : apiStatus === 'degraded' ? 'Slow' : 'Down'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">3 endpoints available</p>
            <div className="flex gap-1.5 mt-2">
              <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-[10px] px-1.5 py-0">/search</Badge>
              <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-[10px] px-1.5 py-0">/extract</Badge>
              <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-[10px] px-1.5 py-0">/smart-search</Badge>
            </div>
          </Card>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content - 2 columns */}
          <div className="lg:col-span-2 space-y-6">
            {/* API Keys Section */}
            <Card className="bg-gray-900/80 border-gray-800/60 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800/60">
                <div className="flex items-center gap-3">
                  <div className="w-1 h-5 bg-orange-500 rounded-sm" />
                  <h2 className="text-lg font-semibold text-white">API Keys</h2>
                  <Badge className="bg-gray-800 text-gray-400 border-gray-700 text-xs">{apiKeys.length}</Badge>
                </div>
                <Button
                  size="sm"
                  onClick={() => setShowNewKeyDialog(true)}
                  className="bg-orange-600 hover:bg-orange-500 text-white text-xs h-8"
                >
                  <Plus className="mr-1.5 w-3.5 h-3.5" />
                  New Key
                </Button>
              </div>

              <div className="p-6">
                {apiKeys.length === 0 ? (
                  <div className="text-center py-10">
                    <div className="w-14 h-14 rounded-2xl bg-gray-800 flex items-center justify-center mx-auto mb-4">
                      <Key className="w-7 h-7 text-gray-600" />
                    </div>
                    <h3 className="text-base font-medium text-white mb-1">No API keys yet</h3>
                    <p className="text-sm text-gray-500 mb-5 max-w-sm mx-auto">
                      Generate your first API key to start making requests to the Search API.
                    </p>
                    <Button
                      onClick={() => setShowNewKeyDialog(true)}
                      className="bg-orange-600 hover:bg-orange-500 text-white"
                    >
                      <Plus className="mr-2 w-4 h-4" />
                      Generate Your First Key
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {apiKeys.map((key) => (
                      <div
                        key={key.id}
                        className="group rounded-xl border border-gray-800/60 bg-gray-800/30 p-4 hover:border-orange-500/20 transition-all duration-200"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="text-sm font-semibold text-white truncate">{key.name}</h3>
                              <Badge className="bg-orange-500/15 text-orange-400 border-orange-500/20 text-[10px] px-1.5 py-0 uppercase">
                                {key.tier}
                              </Badge>
                            </div>

                            <div className="flex items-center gap-1.5 mb-3">
                              <code className="text-xs text-gray-400 bg-gray-900 px-2.5 py-1 rounded-md font-mono truncate max-w-[300px]">
                                {visibleKeys.has(key.id) ? key.key : `${key.key_prefix}${'*'.repeat(24)}`}
                              </code>
                              <button
                                onClick={() => toggleKeyVisibility(key.id)}
                                className="p-1 text-gray-500 hover:text-orange-400 transition-colors"
                              >
                                {visibleKeys.has(key.id) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={() => copyToClipboard(key.key, key.id)}
                                className="p-1 text-gray-500 hover:text-orange-400 transition-colors"
                              >
                                {copiedId === key.id ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Created {new Date(key.created_at).toLocaleDateString()}
                              </span>
                              {key.last_used_at && (
                                <span className="flex items-center gap-1">
                                  <Zap className="w-3 h-3" />
                                  Last used {new Date(key.last_used_at).toLocaleDateString()}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <TrendingUp className="w-3 h-3" />
                                {(key.requests_count || 0).toLocaleString()} requests
                              </span>
                            </div>
                          </div>

                          <button
                            onClick={() => revokeKey(key.key)}
                            className="p-2 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                            title="Revoke key"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            {/* Quick Start */}
            <Card className="bg-gray-900/80 border-gray-800/60 overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-800/60">
                <div className="w-1 h-5 bg-orange-500 rounded-sm" />
                <h2 className="text-lg font-semibold text-white">Quick Start</h2>
              </div>

              <div className="p-6">
                <div className="flex items-center gap-4 mb-4 text-sm">
                  <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-orange-500/10 text-orange-400 text-xs font-medium">
                    <span className="w-4 h-4 rounded-full bg-orange-500 text-white text-[10px] flex items-center justify-center font-bold">1</span>
                    Copy key above
                  </div>
                  <ArrowRight className="w-3 h-3 text-gray-600" />
                  <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-orange-500/10 text-orange-400 text-xs font-medium">
                    <span className="w-4 h-4 rounded-full bg-orange-500 text-white text-[10px] flex items-center justify-center font-bold">2</span>
                    Make a request
                  </div>
                  <ArrowRight className="w-3 h-3 text-gray-600" />
                  <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-gray-800 text-gray-400 text-xs font-medium">
                    <span className="w-4 h-4 rounded-full bg-gray-700 text-gray-300 text-[10px] flex items-center justify-center font-bold">3</span>
                    Get results
                  </div>
                </div>

                {/* Code tabs */}
                <div className="rounded-xl border border-gray-800/60 overflow-hidden">
                  <div className="flex items-center border-b border-gray-800/60 bg-gray-900">
                    {(["curl", "typescript", "python"] as CodeTab[]).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setCodeTab(tab)}
                        className={`px-4 py-2 text-xs font-medium transition-colors ${
                          codeTab === tab
                            ? "text-orange-400 bg-orange-600/10 border-b-2 border-orange-500"
                            : "text-gray-500 hover:text-gray-300"
                        }`}
                      >
                        {tab === "curl" ? "cURL" : tab === "typescript" ? "TypeScript" : "Python"}
                      </button>
                    ))}
                    <div className="flex-1" />
                    <button
                      onClick={() => copyToClipboard(quickStartExamples[codeTab], 'code')}
                      className="px-3 py-2 text-gray-500 hover:text-orange-400 transition-colors"
                    >
                      {copiedId === 'code' ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <div className="p-4 bg-gray-950 overflow-x-auto">
                    <pre className="text-xs text-gray-300 font-mono leading-relaxed whitespace-pre">
                      {quickStartExamples[codeTab]}
                    </pre>
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-gray-700 text-gray-300 hover:text-orange-400 hover:border-orange-500/50 hover:bg-orange-500/10 text-xs"
                    asChild
                  >
                    <Link href="/api">
                      <BookOpen className="mr-1.5 w-3.5 h-3.5" />
                      Full Documentation
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-gray-700 text-gray-300 hover:text-orange-400 hover:border-orange-500/50 hover:bg-orange-500/10 text-xs"
                    asChild
                  >
                    <Link href="/docs">
                      <ExternalLink className="mr-1.5 w-3.5 h-3.5" />
                      Interactive Docs
                    </Link>
                  </Button>
                </div>
              </div>
            </Card>

            {/* API Playground */}
            <Card className="bg-gray-900/80 border-gray-800/60 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800/60">
                <div className="flex items-center gap-3">
                  <div className="w-1 h-5 bg-orange-500 rounded-sm" />
                  <h2 className="text-lg font-semibold text-white">Playground</h2>
                  <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-[10px] px-1.5 py-0">Live</Badge>
                </div>
                {pgLatency !== null && (
                  <span className="text-xs text-gray-500">{pgLatency}ms</span>
                )}
              </div>

              <div className="p-6">
                {/* Endpoint Tabs */}
                <div className="flex items-center gap-1 mb-5 p-1 rounded-xl bg-gray-800/50">
                  {([
                    { key: "search" as PlaygroundEndpoint, label: "Search", icon: <Search className="w-3.5 h-3.5" /> },
                    { key: "extract" as PlaygroundEndpoint, label: "Extract", icon: <FileText className="w-3.5 h-3.5" /> },
                    { key: "smart-search" as PlaygroundEndpoint, label: "Smart Search", icon: <Brain className="w-3.5 h-3.5" /> },
                  ]).map((ep) => (
                    <button
                      key={ep.key}
                      onClick={() => { setPgEndpoint(ep.key); setPgResult(null); setPgError(null); setPgLatency(null) }}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        pgEndpoint === ep.key
                          ? "bg-orange-600/15 text-orange-400"
                          : "text-gray-500 hover:text-gray-300"
                      }`}
                    >
                      {ep.icon}
                      {ep.label}
                    </button>
                  ))}
                </div>

                {/* API Key Selector */}
                {apiKeys.length > 1 && (
                  <div className="mb-4">
                    <label className="text-[11px] text-gray-500 uppercase tracking-wider mb-1.5 block">API Key</label>
                    <div className="relative">
                      <select
                        value={pgSelectedKey}
                        onChange={(e) => setPgSelectedKey(e.target.value)}
                        className="w-full appearance-none bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-300 font-mono focus:outline-none focus:ring-1 focus:ring-orange-500/50 focus:border-orange-500/50 pr-8"
                      >
                        {apiKeys.map((k) => (
                          <option key={k.id} value={k.key}>{k.name} ({k.key_prefix}...)</option>
                        ))}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-gray-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                )}

                {/* Input Fields */}
                <div className="space-y-3 mb-4">
                  {pgEndpoint === "extract" ? (
                    <div>
                      <label className="text-[11px] text-gray-500 uppercase tracking-wider mb-1.5 block">URL</label>
                      <Input
                        placeholder="https://example.com/article"
                        value={pgUrl}
                        onChange={(e) => setPgUrl(e.target.value)}
                        className="bg-gray-950 border-gray-800 text-white text-sm focus:ring-orange-500/50 focus:border-orange-500/50"
                        onKeyDown={(e) => e.key === 'Enter' && !pgRunning && runPlayground()}
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="text-[11px] text-gray-500 uppercase tracking-wider mb-1.5 block">Query</label>
                      <Input
                        placeholder={pgEndpoint === "smart-search" ? "Who is the creator of PiPilot?" : "latest AI news 2024"}
                        value={pgQuery}
                        onChange={(e) => setPgQuery(e.target.value)}
                        className="bg-gray-950 border-gray-800 text-white text-sm focus:ring-orange-500/50 focus:border-orange-500/50"
                        onKeyDown={(e) => e.key === 'Enter' && !pgRunning && runPlayground()}
                      />
                    </div>
                  )}

                  {/* Endpoint-specific options */}
                  {pgEndpoint === "search" && (
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <label className="text-[11px] text-gray-500 uppercase tracking-wider mb-1.5 block">Max Results</label>
                        <Input
                          type="number"
                          min="1"
                          max="20"
                          value={pgMaxResults}
                          onChange={(e) => setPgMaxResults(e.target.value)}
                          className="bg-gray-950 border-gray-800 text-white text-sm focus:ring-orange-500/50 focus:border-orange-500/50"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[11px] text-gray-500 uppercase tracking-wider mb-1.5 block">AI Rerank</label>
                        <button
                          onClick={() => setPgRerank(!pgRerank)}
                          className={`w-full h-9 rounded-lg text-xs font-medium transition-all ${
                            pgRerank
                              ? "bg-orange-600 text-white"
                              : "bg-gray-800 text-gray-400 border border-gray-700"
                          }`}
                        >
                          {pgRerank ? "Enabled" : "Disabled"}
                        </button>
                      </div>
                    </div>
                  )}

                  {pgEndpoint === "smart-search" && (
                    <div>
                      <label className="text-[11px] text-gray-500 uppercase tracking-wider mb-1.5 block">Depth</label>
                      <div className="flex items-center gap-1 p-1 rounded-lg bg-gray-800/50">
                        {(["quick", "normal", "deep"] as const).map((d) => (
                          <button
                            key={d}
                            onClick={() => setPgDepth(d)}
                            className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                              pgDepth === d
                                ? "bg-orange-600/15 text-orange-400"
                                : "text-gray-500 hover:text-gray-300"
                            }`}
                          >
                            {d.charAt(0).toUpperCase() + d.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Run Button */}
                <Button
                  onClick={runPlayground}
                  disabled={pgRunning || apiKeys.length === 0}
                  className="w-full bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-orange-500/20"
                >
                  {pgRunning ? (
                    <>
                      <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                      {pgEndpoint === "smart-search" ? "Researching..." : "Running..."}
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 w-4 h-4" />
                      Send Request
                    </>
                  )}
                </Button>

                {apiKeys.length === 0 && (
                  <p className="text-xs text-gray-500 text-center mt-2">Generate an API key first to use the playground.</p>
                )}

                {/* Error */}
                {pgError && (
                  <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-red-300">{pgError}</p>
                    </div>
                  </div>
                )}

                {/* Results */}
                {pgResult && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] text-gray-500 uppercase tracking-wider">Response</span>
                      <button
                        onClick={() => copyToClipboard(JSON.stringify(pgResult, null, 2), 'pg-result')}
                        className="text-gray-500 hover:text-orange-400 transition-colors p-1"
                      >
                        {copiedId === 'pg-result' ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    {/* Friendly result display */}
                    {pgEndpoint === "search" && pgResult.results ? (
                      <div className="space-y-2">
                        <p className="text-xs text-gray-400 mb-3">{pgResult.results.length} results {pgResult.reranked ? '(AI reranked)' : ''}</p>
                        {pgResult.results.map((r: any, i: number) => (
                          <div key={i} className="rounded-lg border border-gray-800/60 bg-gray-950 p-3">
                            <div className="flex items-start gap-2">
                              <span className="text-[10px] text-orange-400 font-bold bg-orange-500/10 rounded px-1.5 py-0.5 mt-0.5">{i + 1}</span>
                              <div className="flex-1 min-w-0">
                                <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-white hover:text-orange-400 transition-colors line-clamp-1">
                                  {r.title}
                                </a>
                                <p className="text-[11px] text-gray-500 truncate mt-0.5">{r.url}</p>
                                {r.snippet && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{r.snippet}</p>}
                                {r.score !== undefined && (
                                  <span className="text-[10px] text-orange-400/70 mt-1 inline-block">Score: {r.score.toFixed(2)}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : pgEndpoint === "extract" && pgResult.content ? (
                      <div className="rounded-lg border border-gray-800/60 bg-gray-950 p-4">
                        <h4 className="text-sm font-medium text-white mb-1">{pgResult.title || 'Extracted Content'}</h4>
                        {pgResult.url && <p className="text-[11px] text-gray-500 mb-3">{pgResult.url}</p>}
                        <div className="text-xs text-gray-300 leading-relaxed max-h-80 overflow-y-auto whitespace-pre-wrap">
                          {pgResult.content.slice(0, 3000)}{pgResult.content.length > 3000 ? '...' : ''}
                        </div>
                        {pgResult.content.length > 3000 && (
                          <p className="text-[10px] text-gray-500 mt-2">Showing first 3,000 chars of {pgResult.content.length.toLocaleString()}</p>
                        )}
                      </div>
                    ) : pgEndpoint === "smart-search" && pgResult.answer ? (
                      <div className="rounded-lg border border-gray-800/60 bg-gray-950 p-4">
                        <div className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap mb-3">{pgResult.answer}</div>
                        {pgResult.sources && pgResult.sources.length > 0 && (
                          <div className="border-t border-gray-800/60 pt-3 mt-3">
                            <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-2">Sources ({pgResult.sources.length})</p>
                            <div className="space-y-1">
                              {pgResult.sources.map((s: any, i: number) => (
                                <a key={i} href={s.url || s} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 transition-colors truncate">
                                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                  {s.title || s.url || s}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                        {pgResult.iterations && (
                          <p className="text-[10px] text-gray-500 mt-2">{pgResult.iterations} research steps</p>
                        )}
                      </div>
                    ) : (
                      /* Raw JSON fallback */
                      <div className="rounded-xl border border-gray-800/60 bg-gray-950 p-4 overflow-x-auto max-h-96 overflow-y-auto">
                        <pre className="text-xs text-gray-300 font-mono whitespace-pre">
                          {JSON.stringify(pgResult, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Sidebar - 1 column */}
          <div className="space-y-6">
            {/* Plan Details */}
            <Card className="bg-gray-900/80 border-gray-800/60 overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800/60">
                <div className="w-1 h-5 bg-orange-500 rounded-sm" />
                <h2 className="text-sm font-semibold text-white">Plan Details</h2>
              </div>
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <span className="text-xl font-bold text-white">{currentPlan?.name}</span>
                    {currentPlan?.price !== null && currentPlan?.price !== undefined && (
                      <span className="text-sm text-gray-500 ml-2">${currentPlan?.price}/mo</span>
                    )}
                  </div>
                  <Badge className="bg-orange-500/15 text-orange-400 border-orange-500/20">Active</Badge>
                </div>
                <div className="space-y-2.5">
                  {currentPlan?.features.slice(0, 5).map((feature, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-orange-400 mt-0.5 flex-shrink-0" />
                      <span className="text-xs text-gray-400">{feature}</span>
                    </div>
                  ))}
                </div>
                {currentTier !== 'enterprise' && (
                  <Button
                    size="sm"
                    className={`w-full mt-4 text-xs h-8 ${
                      currentTier === 'free'
                        ? 'bg-orange-600 hover:bg-orange-500 text-white'
                        : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700'
                    }`}
                    asChild
                  >
                    <Link href="/api#pricing">
                      {currentTier === 'free' ? 'Upgrade Plan' : 'Change Plan'}
                      <ArrowRight className="ml-1 w-3 h-3" />
                    </Link>
                  </Button>
                )}
              </div>
            </Card>

            {/* Endpoints Reference */}
            <Card className="bg-gray-900/80 border-gray-800/60 overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800/60">
                <div className="w-1 h-5 bg-orange-500 rounded-sm" />
                <h2 className="text-sm font-semibold text-white">Endpoints</h2>
              </div>
              <div className="p-5 space-y-3">
                <div className="rounded-lg border border-gray-800/60 p-3 hover:border-orange-500/20 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="bg-orange-500/15 text-orange-400 border-orange-500/20 text-[10px] px-1.5 py-0 font-mono">POST</Badge>
                    <code className="text-xs text-white font-mono">/search</code>
                  </div>
                  <p className="text-[11px] text-gray-500">Web search with AI reranking</p>
                </div>

                <div className="rounded-lg border border-gray-800/60 p-3 hover:border-orange-500/20 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="bg-orange-500/15 text-orange-400 border-orange-500/20 text-[10px] px-1.5 py-0 font-mono">POST</Badge>
                    <code className="text-xs text-white font-mono">/extract</code>
                  </div>
                  <p className="text-[11px] text-gray-500">Extract content from URLs</p>
                </div>

                <div className="rounded-lg border border-gray-800/60 p-3 hover:border-orange-500/20 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="bg-orange-500/15 text-orange-400 border-orange-500/20 text-[10px] px-1.5 py-0 font-mono">POST</Badge>
                    <code className="text-xs text-white font-mono">/smart-search</code>
                  </div>
                  <p className="text-[11px] text-gray-500">AI agent-powered deep research</p>
                </div>

                <div className="rounded-lg border border-gray-800/60 p-3 hover:border-orange-500/20 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="bg-orange-500/15 text-orange-300 border-orange-500/20 text-[10px] px-1.5 py-0 font-mono">GET</Badge>
                    <code className="text-xs text-white font-mono">/health</code>
                  </div>
                  <p className="text-[11px] text-gray-500">API status and quota info</p>
                </div>
              </div>
            </Card>

            {/* Base URL */}
            <Card className="bg-gray-900/80 border-gray-800/60 overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800/60">
                <div className="w-1 h-5 bg-orange-500 rounded-sm" />
                <h2 className="text-sm font-semibold text-white">Base URL</h2>
              </div>
              <div className="p-5">
                <div className="flex items-center gap-2">
                  <code className="text-xs text-orange-400 bg-gray-950 px-3 py-2 rounded-lg font-mono flex-1 truncate">
                    {BASE_URL}
                  </code>
                  <button
                    onClick={() => copyToClipboard(BASE_URL, 'base-url')}
                    className="p-2 text-gray-500 hover:text-orange-400 transition-colors"
                  >
                    {copiedId === 'base-url' ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <Shield className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-[11px] text-gray-500">All requests require Bearer token auth</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Globe className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-[11px] text-gray-500">Global edge network (Cloudflare Workers)</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* New Key Dialog */}
      <Dialog open={showNewKeyDialog} onOpenChange={setShowNewKeyDialog}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white sm:max-w-md">
          {generatedKey ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-white">
                  <CheckCircle2 className="w-5 h-5 text-green-400" />
                  Key Generated
                </DialogTitle>
                <DialogDescription className="text-gray-400">
                  Copy your API key now. You won't be able to see it again.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <Label className="text-gray-400 text-xs">Your API Key</Label>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Input
                      value={generatedKey}
                      readOnly
                      className="bg-gray-950 border-gray-800 text-white font-mono text-xs focus:ring-orange-500/50 focus:border-orange-500/50"
                    />
                    <Button
                      onClick={() => copyToClipboard(generatedKey, 'new-key')}
                      size="sm"
                      className="bg-orange-600 hover:bg-orange-500 text-white px-3"
                    >
                      {copiedId === 'new-key' ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-yellow-200/80">
                      Store this key securely. It will not be shown again.
                    </p>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button
                  onClick={() => {
                    setGeneratedKey(null)
                    setShowNewKeyDialog(false)
                  }}
                  className="bg-orange-600 hover:bg-orange-500 text-white w-full"
                >
                  Done
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-white">Generate API Key</DialogTitle>
                <DialogDescription className="text-gray-400">
                  Create a new key for your {currentPlan?.name} plan.
                </DialogDescription>
              </DialogHeader>

              <div>
                <Label htmlFor="keyName" className="text-gray-400 text-xs">
                  Key Name
                </Label>
                <Input
                  id="keyName"
                  placeholder="e.g., Production, Development, Testing"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="bg-gray-950 border-gray-800 text-white mt-1.5 focus:ring-orange-500/50 focus:border-orange-500/50"
                  onKeyDown={(e) => e.key === 'Enter' && generateApiKey()}
                />
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  onClick={() => setShowNewKeyDialog(false)}
                  className="border-gray-700 text-gray-300 hover:bg-gray-800"
                >
                  Cancel
                </Button>
                <Button
                  onClick={generateApiKey}
                  disabled={generatingKey || !newKeyName.trim()}
                  className="bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {generatingKey ? (
                    <>
                      <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Key className="mr-2 w-4 h-4" />
                      Generate
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  )
}
