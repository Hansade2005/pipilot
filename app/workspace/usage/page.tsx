"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  ArrowLeft,
  BarChart3,
  TrendingUp,
  Zap,
  Clock,
  Coins,
  Activity,
  RefreshCw,
  Loader2,
  CheckCircle,
  AlertTriangle,
  ChevronDown,
  Bot,
  Cpu,
  Timer,
  Target,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import {
  FREE_PLAN_MONTHLY_CREDITS,
  CREATOR_PLAN_MONTHLY_CREDITS,
  COLLABORATE_PLAN_MONTHLY_CREDITS,
  SCALE_PLAN_MONTHLY_CREDITS,
} from "@/lib/billing/credit-manager"

interface AnalyticsData {
  wallet: {
    balance: number
    usedThisMonth: number
    usedTotal: number
    requestsThisMonth: number
    plan: string
    subscriptionStatus: string
    lastResetDate: string | null
    memberSince: string
  }
  usage: {
    totalCreditsUsed: number
    totalRequests: number
    avgCreditsPerRequest: number
    totalTokens: number
    avgResponseTime: number
    successRate: number
  }
  modelBreakdown: Array<{
    model: string
    credits: number
    requests: number
    tokens: number
    percentage: number
  }>
  dailyUsage: Array<{
    date: string
    credits: number
    requests: number
  }>
  projections: {
    dailyAvgCredits: number
    projectedMonthlyCredits: number
    projectedMonthlyCost: number
  }
  peakUsage: {
    hour: number | null
    requests: number
  }
  transactions: {
    creditsAdded: number
    creditsSpent: number
    recentTransactions: Array<{
      amount: number
      type: string
      description: string
      creditsBefore: number
      creditsAfter: number
      date: string
    }>
  }
  period: number
}

const MODEL_SHORT_NAMES: Record<string, string> = {
  'mistral/devstral-small-2': 'Devstral Small',
  'anthropic/claude-sonnet-4-5': 'Claude Sonnet 4.5',
  'anthropic/claude-opus-4-5': 'Claude Opus 4.5',
  'anthropic/claude-haiku-4-5': 'Claude Haiku 4.5',
  'xai/grok-4-1-fast': 'Grok 4.1 Fast',
  'xai/grok-code-fast-1': 'Grok Fast',
  'openai/gpt-5-1-thinking': 'GPT-5.1',
  'openai/gpt-5-2-codex': 'GPT-5.2 Codex',
  'openai/o3': 'O3',
  'openai/gpt-oss-120b': 'GPT-OSS 120B',
  'google/gemini-2-5-pro': 'Gemini 2.5 Pro',
  'codestral': 'Codestral',
  'zai/glm-4.7-flash': 'GLM 4.7 Flash',
  'zai/glm-4.6': 'GLM 4.6',
  'moonshotai/kimi-k2-thinking': 'Kimi K2',
  'mistral/pixtral-12b-2409': 'Pixtral 12B',
  'kilo/minimax-m2.5-free': 'MiniMax M2.5',
  // Ollama Cloud models
  'ollama/nemotron-3-super': 'Titan Pro',
  'ollama/qwen3-coder:480b': 'Qwen Coder 480B',
  'ollama/qwen3-coder-next': 'Qwen Coder Next',
  'ollama/minimax-m2.1': 'Atlas M2.1',
  'ollama/cogito-2.1:671b': 'Cogito 671B',
  'ollama/gemma4:31b': 'Gemma 4',
  'ollama/glm-4.6': 'GLM 4.6',
  'ollama/gpt-oss:120b': 'Nova 120B',
  'ollama/gpt-oss:20b': 'Nova Flash',
  'ollama/qwen3-vl:235b': 'Qwen Vision 235B',
  'ollama/nemotron-3-nano:30b': 'Titan Nano',
  // Kilo models
  'kilo/auto-free': 'Kilo Auto',
  'kilo/kimi-k2.5-free': 'Kimi K2.5',
  'kilo/giga-potato': 'Giga Potato',
  'kilo/step-3.5-flash-free': 'Step Flash',
}

const MODEL_COLORS = [
  'bg-orange-500',
  'bg-blue-500',
  'bg-emerald-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-yellow-500',
  'bg-cyan-500',
  'bg-red-500',
  'bg-indigo-500',
  'bg-teal-500',
]

const PLAN_CREDITS: Record<string, number> = {
  free: FREE_PLAN_MONTHLY_CREDITS,
  creator: CREATOR_PLAN_MONTHLY_CREDITS,
  collaborate: COLLABORATE_PLAN_MONTHLY_CREDITS,
  scale: SCALE_PLAN_MONTHLY_CREDITS,
}

export default function UsageAnalyticsPage() {
  const router = useRouter()
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState(30)
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false)

  const fetchAnalytics = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      const res = await fetch(`/api/usage/analytics?period=${period}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      })

      if (!res.ok) throw new Error('Failed to fetch analytics')
      const json = await res.json()
      setData(json)
    } catch (err: any) {
      setError(err.message || 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [period, router])

  useEffect(() => {
    fetchAnalytics()
  }, [fetchAnalytics])

  const formatNumber = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
    return n.toFixed(0)
  }

  const formatCredits = (n: number) => {
    if (n >= 10000) return `${(n / 1000).toFixed(1)}K`
    return n.toFixed(1)
  }

  const getMaxBarHeight = (values: number[]) => Math.max(...values, 1)

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
          <p className="text-gray-400 text-sm">Loading analytics...</p>
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Card className="bg-gray-900 border-gray-800 max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-10 w-10 text-orange-500 mx-auto mb-3" />
            <p className="text-gray-300 mb-4">{error}</p>
            <Button onClick={fetchAnalytics} className="bg-orange-600 hover:bg-orange-500 text-white">
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!data) return null

  const monthlyCredits = PLAN_CREDITS[data.wallet.plan] || FREE_PLAN_MONTHLY_CREDITS
  const usagePercent = Math.min((data.wallet.usedThisMonth / monthlyCredits) * 100, 100)
  const daysUntilReset = data.wallet.lastResetDate
    ? Math.max(0, 30 - Math.floor((Date.now() - new Date(data.wallet.lastResetDate).getTime()) / (1000 * 60 * 60 * 24)))
    : 30
  const maxDailyCredits = getMaxBarHeight(data.dailyUsage.map(d => d.credits))

  return (
    <div className="min-h-screen bg-gray-950 pt-16">
      <Navigation />
      {/* Header */}
      <div className="border-b border-gray-800/60 bg-gray-950/80 backdrop-blur-sm sticky top-16 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.back()}
              className="h-8 w-8 text-gray-400 hover:text-orange-400 hover:bg-orange-500/10"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-orange-400" />
              <h1 className="text-lg font-semibold text-gray-100">Usage Analytics</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Period selector */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPeriodDropdown(!showPeriodDropdown)}
                className="text-gray-300 border-gray-700 hover:border-orange-500/50 hover:text-orange-400 text-xs h-8"
              >
                Last {period} days
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
              {showPeriodDropdown && (
                <div className="absolute right-0 top-full mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 py-1 min-w-[120px]">
                  {[7, 14, 30, 60, 90].map(p => (
                    <button
                      key={p}
                      onClick={() => { setPeriod(p); setShowPeriodDropdown(false) }}
                      className={`w-full px-3 py-1.5 text-left text-xs hover:bg-orange-500/10 transition-colors ${
                        period === p ? 'text-orange-400' : 'text-gray-300'
                      }`}
                    >
                      Last {p} days
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchAnalytics}
              disabled={loading}
              className="h-8 w-8 text-gray-400 hover:text-orange-400 hover:bg-orange-500/10"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Plan & Balance Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-gray-900/80 border-gray-800/60 md:col-span-2">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Coins className="h-4 w-4 text-orange-400" />
                  <span className="text-sm font-medium text-gray-300">Credit Balance</span>
                </div>
                <Badge className="bg-orange-500/10 text-orange-400 border-0 text-xs capitalize">
                  {data.wallet.plan} plan
                </Badge>
              </div>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-3xl font-bold text-gray-100">{formatCredits(data.wallet.balance)}</span>
                <span className="text-sm text-gray-500">/ {formatNumber(monthlyCredits)} credits</span>
              </div>
              <Progress value={usagePercent} className="h-2 mb-2 bg-gray-800" />
              <div className="flex justify-between text-xs text-gray-500">
                <span>{formatCredits(data.wallet.usedThisMonth)} used this month</span>
                <span>{daysUntilReset} days until reset</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900/80 border-gray-800/60">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-4 w-4 text-orange-400" />
                <span className="text-sm font-medium text-gray-300">Projected Usage</span>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Monthly credits</span>
                    {data.projections.projectedMonthlyCredits > monthlyCredits ? (
                      <ArrowUpRight className="h-3 w-3 text-red-400" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3 text-emerald-400" />
                    )}
                  </div>
                  <span className="text-xl font-bold text-gray-100">{formatNumber(data.projections.projectedMonthlyCredits)}</span>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Est. monthly cost</span>
                  <p className="text-lg font-semibold text-gray-200">${data.projections.projectedMonthlyCost.toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Daily avg</span>
                  <p className="text-sm text-gray-300">{data.projections.dailyAvgCredits} credits/day</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-gray-900/80 border-gray-800/60">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Zap className="h-3.5 w-3.5 text-orange-400" />
                <span className="text-xs text-gray-500">Total Requests</span>
              </div>
              <span className="text-2xl font-bold text-gray-100">{formatNumber(data.usage.totalRequests)}</span>
              <p className="text-xs text-gray-500 mt-1">{data.wallet.requestsThisMonth} this month</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900/80 border-gray-800/60">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Target className="h-3.5 w-3.5 text-orange-400" />
                <span className="text-xs text-gray-500">Avg per Request</span>
              </div>
              <span className="text-2xl font-bold text-gray-100">{data.usage.avgCreditsPerRequest}</span>
              <p className="text-xs text-gray-500 mt-1">credits/request</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900/80 border-gray-800/60">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Timer className="h-3.5 w-3.5 text-orange-400" />
                <span className="text-xs text-gray-500">Avg Response</span>
              </div>
              <span className="text-2xl font-bold text-gray-100">{(data.usage.avgResponseTime / 1000).toFixed(1)}s</span>
              <p className="text-xs text-gray-500 mt-1">response time</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900/80 border-gray-800/60">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-1.5 mb-2">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-xs text-gray-500">Success Rate</span>
              </div>
              <span className="text-2xl font-bold text-gray-100">{data.usage.successRate}%</span>
              <p className="text-xs text-gray-500 mt-1">{formatNumber(data.usage.totalTokens)} tokens used</p>
            </CardContent>
          </Card>
        </div>

        {/* Daily Usage Chart */}
        <Card className="bg-gray-900/80 border-gray-800/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-300 flex items-center gap-2">
              <Activity className="h-4 w-4 text-orange-400" />
              Daily Credit Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-[2px] h-[140px]">
              {data.dailyUsage.map((day, i) => {
                const height = maxDailyCredits > 0 ? (day.credits / maxDailyCredits) * 100 : 0
                const isToday = day.date === new Date().toISOString().split('T')[0]
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center justify-end group relative">
                    <div
                      className={`w-full rounded-t transition-all ${
                        isToday ? 'bg-orange-500' : 'bg-orange-600/40 group-hover:bg-orange-500/60'
                      }`}
                      style={{ height: `${Math.max(height, 1)}%`, minHeight: day.credits > 0 ? '3px' : '1px' }}
                    />
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-2 hidden group-hover:block z-20">
                      <div className="bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 shadow-xl text-xs whitespace-nowrap">
                        <p className="text-gray-300 font-medium">{new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                        <p className="text-orange-400">{day.credits} credits</p>
                        <p className="text-gray-500">{day.requests} requests</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-gray-600">
              <span>{data.dailyUsage.length > 0 ? new Date(data.dailyUsage[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
              <span>Today</span>
            </div>
          </CardContent>
        </Card>

        {/* Model Breakdown & Transactions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Model Usage */}
          <Card className="bg-gray-900/80 border-gray-800/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <Bot className="h-4 w-4 text-orange-400" />
                Credit Usage by Model
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.modelBreakdown.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-6">No usage data yet</p>
              ) : (
                <div className="space-y-3">
                  {data.modelBreakdown.slice(0, 8).map((entry, i) => (
                    <div key={entry.model}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${MODEL_COLORS[i % MODEL_COLORS.length]}`} />
                          <span className="text-xs text-gray-300 truncate max-w-[160px]">
                            {MODEL_SHORT_NAMES[entry.model] || entry.model.split('/').pop() || entry.model}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-gray-500">{entry.requests} reqs</span>
                          <span className="text-orange-400 font-medium">{formatCredits(entry.credits)}</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${MODEL_COLORS[i % MODEL_COLORS.length]}`}
                          style={{ width: `${entry.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Transactions */}
          <Card className="bg-gray-900/80 border-gray-800/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <Coins className="h-4 w-4 text-orange-400" />
                Recent Transactions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.transactions.recentTransactions.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-6">No transactions yet</p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {data.transactions.recentTransactions.map((tx, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-800/40 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-300 truncate">{tx.description || tx.type}</p>
                        <p className="text-[10px] text-gray-600">
                          {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <span className={`text-xs font-medium ml-2 ${tx.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {tx.amount >= 0 ? '+' : ''}{tx.amount.toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Usage Summary Footer */}
        <Card className="bg-gray-900/80 border-gray-800/60">
          <CardContent className="pt-4 pb-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-xs text-gray-500 mb-1">Credits Added</p>
                <p className="text-lg font-semibold text-emerald-400">+{formatCredits(data.transactions.creditsAdded)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Credits Spent</p>
                <p className="text-lg font-semibold text-red-400">-{formatCredits(data.transactions.creditsSpent)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Peak Hour</p>
                <p className="text-lg font-semibold text-gray-200">
                  {data.peakUsage.hour !== null ? `${data.peakUsage.hour}:00` : '--'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Lifetime Credits</p>
                <p className="text-lg font-semibold text-orange-400">{formatNumber(data.wallet.usedTotal)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Footer />
    </div>
  )
}
