"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Check, Zap, Code, Server, Shield, TrendingUp, ArrowRight, Copy, CheckCircle2, Sparkles, Globe, Clock, DollarSign, BookOpen, Key, AlertTriangle, FileText, Search, Brain } from "lucide-react"
import Link from "next/link"
import { STRIPE_API_PLANS, API_PLAN_ORDER } from "@/config/stripe-api-plans"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"

const BASE_URL = "https://pipilot-search-api.hanscadx8.workers.dev"

type CodeLang = "curl" | "typescript" | "python"
type EndpointKey = "search" | "extract" | "smartSearch"

const endpointCodeExamples: Record<EndpointKey, Record<CodeLang, string>> = {
  search: {
    curl: `curl -X POST ${BASE_URL}/search \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "query": "latest AI news",
    "maxResults": 5,
    "rerank": true
  }'`,
    typescript: `const res = await fetch('${BASE_URL}/search', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query: 'latest AI news',
    maxResults: 5,
    rerank: true
  })
})
const data = await res.json()
console.log(data.results)`,
    python: `import requests

res = requests.post('${BASE_URL}/search',
    headers={'Authorization': 'Bearer YOUR_API_KEY'},
    json={
        'query': 'latest AI news',
        'maxResults': 5,
        'rerank': True
    }
)
data = res.json()
print(data['results'])`
  },
  extract: {
    curl: `curl -X POST ${BASE_URL}/extract \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://example.com/article",
    "format": "markdown"
  }'`,
    typescript: `const res = await fetch('${BASE_URL}/extract', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    url: 'https://example.com/article',
    format: 'markdown'
  })
})
const data = await res.json()
console.log(data.content)`,
    python: `import requests

res = requests.post('${BASE_URL}/extract',
    headers={'Authorization': 'Bearer YOUR_API_KEY'},
    json={
        'url': 'https://example.com/article',
        'format': 'markdown'
    }
)
data = res.json()
print(data['content'])`
  },
  smartSearch: {
    curl: `curl -X POST ${BASE_URL}/smart-search \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "query": "What are the latest breakthroughs in quantum computing?",
    "depth": "normal"
  }'`,
    typescript: `const res = await fetch('${BASE_URL}/smart-search', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query: 'What are the latest breakthroughs in quantum computing?',
    depth: 'normal'
  })
})
const data = await res.json()
console.log(data.answer)
console.log(data.sources)`,
    python: `import requests

res = requests.post('${BASE_URL}/smart-search',
    headers={'Authorization': 'Bearer YOUR_API_KEY'},
    json={
        'query': 'What are the latest breakthroughs in quantum computing?',
        'depth': 'normal'
    }
)
data = res.json()
print(data['answer'])
print(data['sources'])`
  }
}

function CodeBlock({ code, id, copiedCode, onCopy }: { code: string; id: string; copiedCode: string | null; onCopy: (text: string, id: string) => void }) {
  return (
    <div className="relative">
      <pre className="p-5 overflow-x-auto">
        <code className="text-sm text-gray-300 font-mono whitespace-pre">{code}</code>
      </pre>
      <button
        onClick={() => onCopy(code, id)}
        className="absolute top-3 right-3 p-2 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
      >
        {copiedCode === id ? (
          <CheckCircle2 className="w-4 h-4 text-green-400" />
        ) : (
          <Copy className="w-4 h-4 text-gray-400" />
        )}
      </button>
    </div>
  )
}

function TabbedCode({ examples, idPrefix, copiedCode, onCopy }: { examples: Record<CodeLang, string>; idPrefix: string; copiedCode: string | null; onCopy: (text: string, id: string) => void }) {
  const [activeLang, setActiveLang] = useState<CodeLang>("curl")
  const langLabels: Record<CodeLang, string> = { curl: "cURL", typescript: "TypeScript", python: "Python" }

  return (
    <div className="bg-gray-900 border border-gray-700/60 rounded-lg overflow-hidden">
      <div className="flex border-b border-gray-700/60">
        {(Object.keys(examples) as CodeLang[]).map((lang) => (
          <button
            key={lang}
            onClick={() => setActiveLang(lang)}
            className={`px-5 py-2.5 text-sm font-medium border-r border-gray-700/60 last:border-r-0 transition-colors ${
              activeLang === lang
                ? "bg-orange-600/15 text-orange-400 border-b-2 border-b-orange-500"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
            }`}
          >
            {langLabels[lang]}
          </button>
        ))}
      </div>
      <CodeBlock code={examples[activeLang]} id={`${idPrefix}-${activeLang}`} copiedCode={copiedCode} onCopy={onCopy} />
    </div>
  )
}

export default function SearchAPIPage() {
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [activeEndpoint, setActiveEndpoint] = useState<EndpointKey>("search")
  const router = useRouter()
  const supabase = createClient()

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedCode(id)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  const handleGetStarted = async (tier: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/auth/signup?redirect=/api&plan=' + tier)
    } else if (tier === 'free') {
      router.push('/dashboard/api')
    } else {
      router.push('/api/checkout?plan=' + tier)
    }
  }

  const sectionNavItems = [
    { label: "Endpoints", href: "#endpoints" },
    { label: "Code Examples", href: "#examples" },
    { label: "Documentation", href: "#docs" },
    { label: "Pricing", href: "#pricing" },
    { label: "Features", href: "#features" },
    { label: "FAQ", href: "#faq" },
  ]

  return (
    <div className="min-h-screen bg-[#030305]">
      <Navigation />

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-orange-950/40 via-gray-950 to-[#030305]" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-5" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-16">
          <div className="text-center">
            <Badge className="mb-6 bg-orange-500/10 text-orange-400 border-orange-500/30 px-4 py-1.5">
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              SEARCH API
            </Badge>

            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-6 tracking-tight">
              The Cheapest AI Search API
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-300">
                for Developers
              </span>
            </h1>

            <p className="text-xl md:text-2xl text-gray-300 mb-10 max-w-3xl mx-auto leading-relaxed">
              Add powerful AI-powered search to your apps. Free tier included.
              Starting at just <span className="text-orange-400 font-bold">$29/month</span> for 100k requests.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-14">
              <Button
                size="lg"
                className="bg-orange-600 hover:bg-orange-500 text-white text-lg px-8 shadow-lg shadow-orange-500/20 transition-all"
                onClick={() => handleGetStarted('free')}
              >
                Get Started Free
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-gray-600 text-white hover:bg-gray-800 text-lg px-8"
                asChild
              >
                <Link href="#pricing">View Pricing</Link>
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="text-gray-300 hover:text-orange-400 hover:bg-orange-500/10 text-lg px-8"
                asChild
              >
                <a href={`${BASE_URL}/health`} target="_blank" rel="noopener noreferrer">
                  <Server className="mr-2 w-5 h-5" />
                  API Status
                </a>
              </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
              {[
                { icon: Zap, label: 'p50 Latency', value: '<100ms' },
                { icon: Globe, label: 'Cache Hit Rate', value: '90%+' },
                { icon: Shield, label: 'Uptime SLA', value: '99.9%' },
                { icon: DollarSign, label: 'vs Competitors', value: '10x Cheaper' }
              ].map((stat, i) => (
                <div key={i} className="bg-gray-900/80 backdrop-blur border border-gray-700/60 rounded-xl p-4 hover:border-orange-500/30 transition-all duration-300">
                  <stat.icon className="w-6 h-6 text-orange-400 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-white">{stat.value}</div>
                  <div className="text-sm text-gray-400">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Sticky Section Navigation */}
      <nav className="sticky top-0 z-40 bg-gray-950/90 backdrop-blur-md border-b border-gray-800/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-1 overflow-x-auto py-3 scrollbar-hide">
            {sectionNavItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="px-4 py-1.5 text-sm font-medium text-gray-400 hover:text-orange-400 hover:bg-orange-500/10 rounded-lg transition-colors whitespace-nowrap"
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>
      </nav>

      {/* Endpoints Overview */}
      <section id="endpoints" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Three Powerful Endpoints
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Everything you need for AI-powered search, content extraction, and research automation.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: Search, title: 'Search', endpoint: 'POST /search', desc: 'Search the web with AI-powered reranking. Get relevant results fast with intelligent caching.', color: 'from-orange-500 to-orange-600' },
            { icon: FileText, title: 'Extract', endpoint: 'POST /extract', desc: 'Extract clean, readable content from any URL. Supports Markdown, plain text, and HTML output.', color: 'from-orange-500 to-orange-600' },
            { icon: Brain, title: 'Smart Search', endpoint: 'POST /smart-search', desc: 'AI research agent that searches, reads pages, and synthesizes comprehensive answers.', color: 'from-orange-500 to-orange-600' }
          ].map((api, i) => (
            <Card key={i} className="bg-gray-900 border-gray-700/60 p-6 hover:border-orange-500/30 transition-all duration-300 hover:shadow-lg hover:shadow-orange-500/10">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${api.color} flex items-center justify-center mb-4`}>
                <api.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white mb-1">{api.title}</h3>
              <code className="text-sm text-orange-400 font-mono">{api.endpoint}</code>
              <p className="text-gray-400 mt-3 text-sm leading-relaxed">{api.desc}</p>
            </Card>
          ))}
        </div>

        {/* Health endpoint note */}
        <div className="mt-6 flex items-center justify-center gap-3 text-sm text-gray-500">
          <Server className="w-4 h-4" />
          <span>Plus <code className="text-orange-400/70 font-mono">GET /health</code> for status monitoring (no auth required)</span>
        </div>
      </section>

      {/* Live Code Examples */}
      <section id="examples" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Start Building in Minutes
          </h2>
          <p className="text-gray-400 text-lg">
            Pick an endpoint, copy the code, and you are live.
          </p>
        </div>

        {/* Endpoint tabs */}
        <div className="flex gap-2 mb-6 justify-center flex-wrap">
          {([
            { key: "search" as EndpointKey, label: "Search", icon: Search },
            { key: "extract" as EndpointKey, label: "Extract", icon: FileText },
            { key: "smartSearch" as EndpointKey, label: "Smart Search", icon: Brain },
          ]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveEndpoint(key)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeEndpoint === key
                  ? "bg-orange-600/15 text-orange-400 border border-orange-500/30"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 border border-gray-700/60"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        <TabbedCode
          examples={endpointCodeExamples[activeEndpoint]}
          idPrefix={`demo-${activeEndpoint}`}
          copiedCode={copiedCode}
          onCopy={copyToClipboard}
        />
      </section>

      {/* ============================================ */}
      {/* API DOCUMENTATION SECTION */}
      {/* ============================================ */}
      <section id="docs" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-orange-500/10 text-orange-400 border-orange-500/30 px-3 py-1">
            <BookOpen className="w-3.5 h-3.5 mr-1.5" />
            DOCUMENTATION
          </Badge>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            API Reference
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Complete reference for all endpoints, authentication, and response formats.
          </p>
          <p className="text-gray-500 text-sm mt-2 font-mono">
            Base URL: <span className="text-orange-400">{BASE_URL}</span>
          </p>
        </div>

        {/* Authentication */}
        <div className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1 h-6 bg-orange-500 rounded-sm" />
            <Key className="w-5 h-5 text-orange-400" />
            <h3 className="text-2xl font-bold text-white">Authentication</h3>
          </div>
          <Card className="bg-gray-900 border-gray-700/60 p-6">
            <p className="text-gray-300 mb-4">
              All endpoints except <code className="text-orange-400 font-mono text-sm bg-gray-800 px-1.5 py-0.5 rounded">/health</code> require an API key passed via the <code className="text-orange-400 font-mono text-sm bg-gray-800 px-1.5 py-0.5 rounded">Authorization</code> header.
            </p>
            <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 font-mono text-sm mb-4">
              <span className="text-gray-500">Authorization:</span> <span className="text-orange-300">Bearer YOUR_API_KEY</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div className="bg-gray-800/50 rounded-lg p-4">
                <div className="text-white font-medium mb-1">Free tier keys</div>
                <code className="text-orange-400 font-mono">pk_test_*</code>
                <p className="text-gray-400 mt-1">Generated at <Link href="/dashboard/api" className="text-orange-400 hover:text-orange-300 underline underline-offset-2">/dashboard/api</Link></p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-4">
                <div className="text-white font-medium mb-1">Paid tier keys</div>
                <code className="text-orange-400 font-mono">pk_live_*</code>
                <p className="text-gray-400 mt-1">Generated at <Link href="/dashboard/api" className="text-orange-400 hover:text-orange-300 underline underline-offset-2">/dashboard/api</Link></p>
              </div>
            </div>
          </Card>
        </div>

        {/* ---- POST /search ---- */}
        <div className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1 h-6 bg-orange-500 rounded-sm" />
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 font-mono text-xs">POST</Badge>
            <h3 className="text-2xl font-bold text-white font-mono">/search</h3>
          </div>
          <Card className="bg-gray-900 border-gray-700/60 p-6">
            <p className="text-gray-300 mb-6">Search the web with AI-powered reranking. Returns a list of relevant results with titles, URLs, snippets, and relevance scores.</p>

            <h4 className="text-white font-semibold mb-3 text-sm uppercase tracking-wider">Parameters</h4>
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700/60">
                    <th className="text-left py-2 pr-4 text-gray-400 font-medium">Name</th>
                    <th className="text-left py-2 pr-4 text-gray-400 font-medium">Type</th>
                    <th className="text-left py-2 pr-4 text-gray-400 font-medium">Required</th>
                    <th className="text-left py-2 text-gray-400 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300">
                  <tr className="border-b border-gray-800/60">
                    <td className="py-2.5 pr-4 font-mono text-orange-400">query</td>
                    <td className="py-2.5 pr-4">string</td>
                    <td className="py-2.5 pr-4"><Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">Required</Badge></td>
                    <td className="py-2.5">The search query string</td>
                  </tr>
                  <tr className="border-b border-gray-800/60">
                    <td className="py-2.5 pr-4 font-mono text-orange-400">maxResults</td>
                    <td className="py-2.5 pr-4">number</td>
                    <td className="py-2.5 pr-4"><span className="text-gray-500">Default: 10</span></td>
                    <td className="py-2.5">Maximum number of results to return</td>
                  </tr>
                  <tr className="border-b border-gray-800/60">
                    <td className="py-2.5 pr-4 font-mono text-orange-400">rerank</td>
                    <td className="py-2.5 pr-4">boolean</td>
                    <td className="py-2.5 pr-4"><span className="text-gray-500">Default: true</span></td>
                    <td className="py-2.5">Enable AI-powered result reranking</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-mono text-orange-400">region</td>
                    <td className="py-2.5 pr-4">string</td>
                    <td className="py-2.5 pr-4"><span className="text-gray-500">Optional</span></td>
                    <td className="py-2.5">Region code for localized results</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h4 className="text-white font-semibold mb-3 text-sm uppercase tracking-wider">Response</h4>
            <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 font-mono text-sm text-gray-300 mb-6 overflow-x-auto">
              <pre>{`{
  "success": true,
  "query": "latest AI news",
  "results": [
    {
      "title": "Result Title",
      "url": "https://example.com",
      "snippet": "Result description...",
      "position": 1,
      "score": 0.95
    }
  ],
  "count": 5,
  "cached": false,
  "reranked": true,
  "processingTime": "84ms"
}`}</pre>
            </div>

            <h4 className="text-white font-semibold mb-3 text-sm uppercase tracking-wider">Example</h4>
            <TabbedCode
              examples={endpointCodeExamples.search}
              idPrefix="doc-search"
              copiedCode={copiedCode}
              onCopy={copyToClipboard}
            />
          </Card>
        </div>

        {/* ---- POST /extract ---- */}
        <div className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1 h-6 bg-orange-500 rounded-sm" />
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 font-mono text-xs">POST</Badge>
            <h3 className="text-2xl font-bold text-white font-mono">/extract</h3>
          </div>
          <Card className="bg-gray-900 border-gray-700/60 p-6">
            <p className="text-gray-300 mb-6">Extract clean, readable content from any URL. Perfect for scraping articles, blog posts, and documentation pages.</p>

            <h4 className="text-white font-semibold mb-3 text-sm uppercase tracking-wider">Parameters</h4>
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700/60">
                    <th className="text-left py-2 pr-4 text-gray-400 font-medium">Name</th>
                    <th className="text-left py-2 pr-4 text-gray-400 font-medium">Type</th>
                    <th className="text-left py-2 pr-4 text-gray-400 font-medium">Required</th>
                    <th className="text-left py-2 text-gray-400 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300">
                  <tr className="border-b border-gray-800/60">
                    <td className="py-2.5 pr-4 font-mono text-orange-400">url</td>
                    <td className="py-2.5 pr-4">string</td>
                    <td className="py-2.5 pr-4"><Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">Required</Badge></td>
                    <td className="py-2.5">The URL to extract content from</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-mono text-orange-400">format</td>
                    <td className="py-2.5 pr-4">string</td>
                    <td className="py-2.5 pr-4"><span className="text-gray-500">Default: &quot;markdown&quot;</span></td>
                    <td className="py-2.5">Output format: <code className="text-orange-400/70 bg-gray-800 px-1 rounded">&quot;markdown&quot;</code> | <code className="text-orange-400/70 bg-gray-800 px-1 rounded">&quot;text&quot;</code> | <code className="text-orange-400/70 bg-gray-800 px-1 rounded">&quot;html&quot;</code></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h4 className="text-white font-semibold mb-3 text-sm uppercase tracking-wider">Response</h4>
            <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 font-mono text-sm text-gray-300 mb-6 overflow-x-auto">
              <pre>{`{
  "success": true,
  "url": "https://example.com/article",
  "content": "# Article Title\\n\\nArticle content in markdown...",
  "format": "markdown",
  "wordCount": 1250,
  "charCount": 7840,
  "cached": false,
  "processingTime": "320ms"
}`}</pre>
            </div>

            <h4 className="text-white font-semibold mb-3 text-sm uppercase tracking-wider">Example</h4>
            <TabbedCode
              examples={endpointCodeExamples.extract}
              idPrefix="doc-extract"
              copiedCode={copiedCode}
              onCopy={copyToClipboard}
            />
          </Card>
        </div>

        {/* ---- POST /smart-search ---- */}
        <div className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1 h-6 bg-orange-500 rounded-sm" />
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 font-mono text-xs">POST</Badge>
            <h3 className="text-2xl font-bold text-white font-mono">/smart-search</h3>
          </div>
          <Card className="bg-gray-900 border-gray-700/60 p-6">
            <p className="text-gray-300 mb-6">AI research agent that searches the web and reads pages to produce comprehensive, sourced answers. Supports configurable search depth.</p>

            <h4 className="text-white font-semibold mb-3 text-sm uppercase tracking-wider">Parameters</h4>
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700/60">
                    <th className="text-left py-2 pr-4 text-gray-400 font-medium">Name</th>
                    <th className="text-left py-2 pr-4 text-gray-400 font-medium">Type</th>
                    <th className="text-left py-2 pr-4 text-gray-400 font-medium">Required</th>
                    <th className="text-left py-2 text-gray-400 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300">
                  <tr className="border-b border-gray-800/60">
                    <td className="py-2.5 pr-4 font-mono text-orange-400">query</td>
                    <td className="py-2.5 pr-4">string</td>
                    <td className="py-2.5 pr-4"><Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">Required</Badge></td>
                    <td className="py-2.5">The research question to answer</td>
                  </tr>
                  <tr className="border-b border-gray-800/60">
                    <td className="py-2.5 pr-4 font-mono text-orange-400">depth</td>
                    <td className="py-2.5 pr-4">string</td>
                    <td className="py-2.5 pr-4"><span className="text-gray-500">Default: &quot;normal&quot;</span></td>
                    <td className="py-2.5"><code className="text-orange-400/70 bg-gray-800 px-1 rounded">&quot;quick&quot;</code> | <code className="text-orange-400/70 bg-gray-800 px-1 rounded">&quot;normal&quot;</code> | <code className="text-orange-400/70 bg-gray-800 px-1 rounded">&quot;deep&quot;</code></td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-mono text-orange-400">maxIterations</td>
                    <td className="py-2.5 pr-4">number</td>
                    <td className="py-2.5 pr-4"><span className="text-gray-500">Optional</span></td>
                    <td className="py-2.5">Max research iterations. Defaults by depth: quick=3, normal=8, deep=15. Max: 30</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h4 className="text-white font-semibold mb-3 text-sm uppercase tracking-wider">Response</h4>
            <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 font-mono text-sm text-gray-300 mb-6 overflow-x-auto">
              <pre>{`{
  "success": true,
  "query": "What are the latest breakthroughs in quantum computing?",
  "answer": "Based on my research, the latest breakthroughs include...",
  "sources": [
    { "type": "search", "query": "quantum computing breakthroughs 2025" },
    { "type": "url", "url": "https://example.com/quantum-article" }
  ],
  "steps": [
    {
      "iteration": 1,
      "action": "search",
      "llmTime": "1.2s"
    }
  ],
  "iterations": 5,
  "totalTime": "8.4s"
}`}</pre>
            </div>

            <h4 className="text-white font-semibold mb-3 text-sm uppercase tracking-wider">Example</h4>
            <TabbedCode
              examples={endpointCodeExamples.smartSearch}
              idPrefix="doc-smart"
              copiedCode={copiedCode}
              onCopy={copyToClipboard}
            />
          </Card>
        </div>

        {/* ---- GET /health ---- */}
        <div className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1 h-6 bg-orange-500 rounded-sm" />
            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 font-mono text-xs">GET</Badge>
            <h3 className="text-2xl font-bold text-white font-mono">/health</h3>
            <Badge className="bg-gray-700/50 text-gray-400 border-gray-600/30 text-xs">No Auth</Badge>
          </div>
          <Card className="bg-gray-900 border-gray-700/60 p-6">
            <p className="text-gray-300 mb-6">Check API status and quota usage. No authentication required.</p>

            <h4 className="text-white font-semibold mb-3 text-sm uppercase tracking-wider">Response</h4>
            <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 font-mono text-sm text-gray-300 mb-6 overflow-x-auto">
              <pre>{`{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2025-01-15T10:30:00Z",
  "quota": {
    "used": 4521,
    "limit": 10000,
    "remaining": 5479,
    "percentage": 45.21,
    "resetsAt": "2025-01-16T00:00:00Z"
  }
}`}</pre>
            </div>

            <h4 className="text-white font-semibold mb-3 text-sm uppercase tracking-wider">Example</h4>
            <div className="bg-gray-900 border border-gray-700/60 rounded-lg overflow-hidden">
              <CodeBlock
                code={`curl ${BASE_URL}/health`}
                id="doc-health"
                copiedCode={copiedCode}
                onCopy={copyToClipboard}
              />
            </div>
          </Card>
        </div>

        {/* Rate Limits */}
        <div className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1 h-6 bg-orange-500 rounded-sm" />
            <Clock className="w-5 h-5 text-orange-400" />
            <h3 className="text-2xl font-bold text-white">Rate Limits</h3>
          </div>
          <Card className="bg-gray-900 border-gray-700/60 p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700/60">
                    <th className="text-left py-3 pr-6 text-gray-400 font-medium">Plan</th>
                    <th className="text-left py-3 pr-6 text-gray-400 font-medium">Rate Limit</th>
                    <th className="text-left py-3 text-gray-400 font-medium">Monthly Requests</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300">
                  <tr className="border-b border-gray-800/60">
                    <td className="py-3 pr-6 font-medium text-white">Free</td>
                    <td className="py-3 pr-6">10 req/min</td>
                    <td className="py-3">10,000</td>
                  </tr>
                  <tr className="border-b border-gray-800/60">
                    <td className="py-3 pr-6 font-medium text-white">Starter</td>
                    <td className="py-3 pr-6">100 req/min</td>
                    <td className="py-3">100,000</td>
                  </tr>
                  <tr className="border-b border-gray-800/60">
                    <td className="py-3 pr-6 font-medium text-white">Pro</td>
                    <td className="py-3 pr-6">500 req/min</td>
                    <td className="py-3">1,000,000</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-6 font-medium text-white">Enterprise</td>
                    <td className="py-3 pr-6">Custom</td>
                    <td className="py-3">Unlimited</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Response Headers */}
        <div className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1 h-6 bg-orange-500 rounded-sm" />
            <Server className="w-5 h-5 text-orange-400" />
            <h3 className="text-2xl font-bold text-white">Response Headers</h3>
          </div>
          <Card className="bg-gray-900 border-gray-700/60 p-6">
            <p className="text-gray-300 mb-4">Every response includes metadata headers for monitoring usage and performance.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700/60">
                    <th className="text-left py-2 pr-6 text-gray-400 font-medium">Header</th>
                    <th className="text-left py-2 text-gray-400 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300">
                  {[
                    { header: "X-Processing-Time", desc: "Time taken to process the request (e.g., \"84ms\")" },
                    { header: "X-Quota-Used", desc: "Number of requests used in the current billing period" },
                    { header: "X-Quota-Remaining", desc: "Number of requests remaining in the current period" },
                    { header: "X-Quota-Limit", desc: "Total monthly request limit for your plan" },
                    { header: "X-Cache-Only-Mode", desc: "\"true\" when quota is near limit and only cached results are served" },
                    { header: "X-Cached", desc: "\"true\" when the response was served from cache" },
                  ].map(({ header, desc }) => (
                    <tr key={header} className="border-b border-gray-800/60 last:border-b-0">
                      <td className="py-2.5 pr-6 font-mono text-orange-400 whitespace-nowrap">{header}</td>
                      <td className="py-2.5">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Error Codes */}
        <div className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1 h-6 bg-orange-500 rounded-sm" />
            <AlertTriangle className="w-5 h-5 text-orange-400" />
            <h3 className="text-2xl font-bold text-white">Error Codes</h3>
          </div>
          <Card className="bg-gray-900 border-gray-700/60 p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700/60">
                    <th className="text-left py-2 pr-6 text-gray-400 font-medium">Status</th>
                    <th className="text-left py-2 pr-6 text-gray-400 font-medium">Error</th>
                    <th className="text-left py-2 text-gray-400 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300">
                  {[
                    { code: "400", label: "Bad Request", desc: "Missing or invalid parameters in the request body" },
                    { code: "401", label: "Unauthorized", desc: "Invalid or missing API key in Authorization header" },
                    { code: "429", label: "Too Many Requests", desc: "Rate limit exceeded. Retry after the cooldown period" },
                    { code: "500", label: "Internal Server Error", desc: "Unexpected server error. Contact support if persistent" },
                    { code: "503", label: "Service Unavailable", desc: "Quota exhausted or cache-only mode active" },
                  ].map(({ code, label, desc }) => (
                    <tr key={code} className="border-b border-gray-800/60 last:border-b-0">
                      <td className="py-2.5 pr-6">
                        <Badge className={`font-mono text-xs ${
                          code === "400" || code === "401" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" :
                          code === "429" ? "bg-orange-500/20 text-orange-400 border-orange-500/30" :
                          "bg-red-500/20 text-red-400 border-red-500/30"
                        }`}>{code}</Badge>
                      </td>
                      <td className="py-2.5 pr-6 font-medium text-white">{label}</td>
                      <td className="py-2.5">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 bg-gray-950 border border-gray-800 rounded-lg p-4 font-mono text-sm text-gray-300 overflow-x-auto">
              <p className="text-gray-500 mb-2 font-sans text-xs uppercase tracking-wider">Error response format</p>
              <pre>{`{
  "success": false,
  "error": "Error message describing what went wrong"
}`}</pre>
            </div>
          </Card>
        </div>
      </section>

      {/* ============================================ */}
      {/* PRICING SECTION */}
      {/* ============================================ */}
      <section id="pricing" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-gray-400 text-lg">
            Start free. Scale as you grow. No hidden fees.
          </p>
        </div>

        <div className="grid md:grid-cols-4 gap-6">
          {API_PLAN_ORDER.map((tierKey) => {
            const plan = STRIPE_API_PLANS[tierKey]
            const isPopular = 'popular' in plan && plan.popular

            return (
              <Card
                key={tierKey}
                className={`relative bg-gray-900 border-2 ${
                  isPopular ? 'border-orange-500' : 'border-gray-700/60'
                } p-6 flex flex-col hover:border-orange-500/30 transition-all duration-300`}
              >
                {isPopular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-600 text-white border-0">
                    Most Popular
                  </Badge>
                )}

                <div className="mb-4">
                  <h3 className="text-2xl font-bold text-white">{plan.name}</h3>
                  <div className="mt-2">
                    {plan.price !== null ? (
                      <>
                        <span className="text-4xl font-bold text-white">${plan.price}</span>
                        <span className="text-gray-400">/month</span>
                      </>
                    ) : (
                      <span className="text-4xl font-bold text-white">Custom</span>
                    )}
                  </div>
                  <p className="text-gray-400 mt-2">{plan.requestsDisplay}</p>
                </div>

                <div className="flex-1 mb-6">
                  <ul className="space-y-3">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                        <span className="text-gray-300 text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Button
                  className={`w-full ${
                    isPopular
                      ? 'bg-orange-600 hover:bg-orange-500 shadow-lg shadow-orange-500/20'
                      : 'bg-gray-800 hover:bg-gray-700 border border-gray-700/60'
                  } text-white transition-all`}
                  onClick={() => handleGetStarted(tierKey)}
                >
                  {plan.cta}
                </Button>
              </Card>
            )
          })}
        </div>

        <p className="text-center text-gray-500 mt-8 text-sm">
          All plans include 90%+ cache hit rate for maximum cost efficiency. No credit card required for free tier.
        </p>
      </section>

      {/* ============================================ */}
      {/* FEATURES SECTION */}
      {/* ============================================ */}
      <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Why PiPilot Search API?
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Built for developers who need reliable, fast, and affordable AI-powered search.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: DollarSign,
              title: '10x Cheaper',
              desc: 'Same quality as Exa, Tavily, Perplexity -- but 10x cheaper. Free tier included with 10k requests/month.'
            },
            {
              icon: Zap,
              title: 'Lightning Fast',
              desc: '<100ms p50 latency with 90%+ cache hit rate. Built on Cloudflare Workers for global edge performance.'
            },
            {
              icon: Shield,
              title: 'Quota Protection',
              desc: 'Smart quota management ensures zero downtime. Graceful degradation with cache-only mode under load.'
            },
            {
              icon: Code,
              title: 'Developer First',
              desc: 'Simple REST API with clear documentation. Works with any language -- just HTTP requests.'
            },
            {
              icon: TrendingUp,
              title: '99.9% Uptime',
              desc: 'Built on Cloudflare Workers edge network. Global distribution with high reliability guarantees.'
            },
            {
              icon: Sparkles,
              title: 'AI-Powered',
              desc: 'Free AI reranking improves search relevance. Smart search with iterative research capabilities.'
            }
          ].map((feature, i) => (
            <Card key={i} className="bg-gray-900 border-gray-700/60 p-6 hover:border-orange-500/30 transition-all duration-300 hover:shadow-lg hover:shadow-orange-500/10">
              <feature.icon className="w-10 h-10 text-orange-400 mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">{feature.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{feature.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ============================================ */}
      {/* FAQ SECTION */}
      {/* ============================================ */}
      <section id="faq" className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="space-y-4">
          {[
            {
              q: 'How is this so cheap?',
              a: 'We use free external services (Jina Reader, DuckDuckGo, a0 LLM) and aggressive caching (90%+ hit rate). This lets us offer the same quality as expensive alternatives at a fraction of the cost.'
            },
            {
              q: 'What happens when I hit my quota?',
              a: 'We have smart quota management. At 80% usage, we switch to cache-only mode -- cached results still work instantly. At 95%, service pauses until the next reset. This means zero downtime for most users.'
            },
            {
              q: 'Can I upgrade or downgrade anytime?',
              a: 'Yes. Upgrade instantly and get access to higher limits immediately. Downgrade at the end of your billing period. No lock-in contracts.'
            },
            {
              q: 'Do you offer a free trial?',
              a: 'The free tier includes 10,000 requests/month forever. No credit card required. Start building right away.'
            },
            {
              q: 'What about rate limits?',
              a: 'Free: 10 req/min, Starter: 100 req/min, Pro: 500 req/min, Enterprise: Custom. All plans include burst allowance for short traffic spikes.'
            },
            {
              q: 'How does the Smart Search endpoint work?',
              a: 'Smart Search is an AI research agent. It iteratively searches the web and reads pages to build a comprehensive answer. You control depth (quick/normal/deep) to balance speed vs thoroughness.'
            },
            {
              q: 'What formats does the Extract endpoint support?',
              a: 'Extract supports Markdown (default), plain text, and raw HTML output. Markdown is recommended for clean, readable content extraction.'
            },
            {
              q: 'Is there an Enterprise plan?',
              a: 'Yes. Contact us for unlimited requests, custom deployment, white-label options, and SLA contracts with guarantees.'
            }
          ].map((faq, i) => (
            <Card key={i} className="bg-gray-900 border-gray-700/60 p-6">
              <h3 className="text-lg font-semibold text-white mb-2">{faq.q}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{faq.a}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ============================================ */}
      {/* CTA SECTION */}
      {/* ============================================ */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <Card className="bg-gradient-to-br from-orange-500/20 to-orange-600/10 border-orange-500/30 p-12 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to Build with PiPilot Search API?
          </h2>
          <p className="text-gray-300 text-lg mb-8 max-w-xl mx-auto">
            Join developers building the future of AI-powered search. Free tier, no credit card required.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              className="bg-orange-600 hover:bg-orange-500 text-white text-lg px-8 shadow-lg shadow-orange-500/20 transition-all"
              onClick={() => handleGetStarted('free')}
            >
              Get Started Free
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-orange-400 hover:text-orange-300 border-orange-500/50 hover:border-orange-500 hover:bg-orange-500/10 text-lg px-8"
              asChild
            >
              <Link href="#docs">Read Documentation</Link>
            </Button>
          </div>
        </Card>
      </section>

      <Footer />
    </div>
  )
}
