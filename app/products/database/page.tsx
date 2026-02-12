"use client"

import { useState } from "react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Database,
  Zap,
  Shield,
  Key,
  FileJson,
  Sparkles,
  Code2,
  Image,
  Check,
  ArrowRight,
  Code,
  Server,
  FileText,
  Cloud,
  Table2,
  FileCode,
  Brain
} from "lucide-react"
import Link from "next/link"

export default function DatabaseProductPage() {
  usePageTitle('Database')

  const features = [
    {
      icon: Database,
      title: "PostgreSQL Databases",
      description: "Create 1 database per project with 500MB storage. Powered by Supabase's reliable infrastructure."
    },
    {
      icon: Sparkles,
      title: "AI Schema Generation",
      description: "Describe your data needs in plain English and let AI generate the perfect database schema instantly."
    },
    {
      icon: Table2,
      title: "Visual Table Builder",
      description: "Design tables with our intuitive UI. Support for 10+ data types including JSON, UUID, and timestamps."
    },
    {
      icon: Key,
      title: "API Keys System",
      description: "Secure API keys for external apps. Built-in rate limiting (1000 req/hour) and usage tracking."
    },
    {
      icon: Code2,
      title: "Auto-Generated REST APIs",
      description: "Get instant CRUD endpoints for every table. Full documentation with code examples in 6+ frameworks."
    },
    {
      icon: Image,
      title: "File Storage (500MB)",
      description: "Upload images, PDFs, videos up to 10MB each. Public & private files with signed URLs."
    },
    {
      icon: FileCode,
      title: "API Docs Generator",
      description: "Framework-specific integration guides with your actual database IDs and API keys auto-filled."
    },
    {
      icon: Shield,
      title: "Row Level Security",
      description: "Built-in RLS policies ensure users only access their own data. Secure by default."
    },
    {
      icon: Brain,
      title: "AI Assistant Integration",
      description: "Connect Claude, Cursor, VS Code, and other AI assistants directly to your database via MCP server."
    }
  ]



  const codeExamples = [
    {
      language: "JavaScript",
      code: `// Fetch all records
const response = await fetch(
  'https://pipilot.dev/api/v1/databases/YOUR_DB_ID/tables/YOUR_TABLE_ID/records',
  {
    headers: {
      'Authorization': 'Bearer YOUR_API_KEY',
      'Content-Type': 'application/json'
    }
  }
);

const { records } = await response.json();

// Create a record
await fetch(
  'https://pipilot.dev/api/v1/databases/YOUR_DB_ID/tables/YOUR_TABLE_ID/records',
  {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer YOUR_API_KEY',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      data: {
        name: 'John Doe',
        email: 'john@example.com'
      }
    })
  }
);`
    },
    {
      language: "Python",
      code: `import requests

# Fetch all records
response = requests.get(
    'https://pipilot.dev/api/v1/databases/YOUR_DB_ID/tables/YOUR_TABLE_ID/records',
    headers={
        'Authorization': 'Bearer YOUR_API_KEY',
        'Content-Type': 'application/json'
    }
)

records = response.json()['records']

# Create a record
requests.post(
    'https://pipilot.dev/api/v1/databases/YOUR_DB_ID/tables/YOUR_TABLE_ID/records',
    headers={
        'Authorization': 'Bearer YOUR_API_KEY',
        'Content-Type': 'application/json'
    },
    json={
        'data': {
            'name': 'John Doe',
            'email': 'john@example.com'
        }
    }
)`
    },
    {
      language: "SDK (TypeScript)",
      code: `// Install: npm install pipilot-sdk
import PiPilot, { TableRecord } from 'pipilot-sdk';
import { usePageTitle } from '@/hooks/use-page-title'

// Initialize with type safety
const pipilot = new PiPilot('YOUR_API_KEY', 'YOUR_DB_ID');

// Define your data structure
interface User {
  name: string;
  email: string;
}

// Fetch all records (fully typed)
const { data: users } = await pipilot.fetchTableRecords<User>('YOUR_TABLE_ID');
console.log(\`Found \${users.length} users\`);

// Create a record with type safety
const newUser: User = {
  name: 'John Doe',
  email: 'john@example.com'
};

const { data } = await pipilot.insertTableRecord('YOUR_TABLE_ID', newUser);
console.log('User created:', data);`
    }
  ]

  const [selectedLanguage, setSelectedLanguage] = useState(0)

  return (
    <div className="min-h-screen relative overflow-hidden bg-gray-950">
      {/* Enhanced Gradient Background */}
      <div className="absolute inset-0 lovable-gradient" />
      <div className="absolute inset-0 noise-texture" />

      <Navigation />

      <main className="relative z-10">
        {/* Hero Section */}
        <section className="pt-32 pb-20 px-4">
          <div className="container mx-auto max-w-6xl text-center">
            <Badge className="mb-4 bg-purple-500/20 text-purple-300 border-purple-500/30">
              🎉 Database as a Service
            </Badge>
            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6">
              PostgreSQL databases
              <br />
              <span className="bg-gradient-to-r from-purple-400 to-pink-400 text-transparent bg-clip-text">
                powered by AI
              </span>
            </h1>
            <p className="text-xl text-gray-300 mb-8 max-w-3xl mx-auto">
              Create databases with AI schema generation, get auto-generated REST APIs,
              500MB storage + file uploads. Secure API keys for external apps. All free forever.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/auth/signup">
                <Button size="lg" className="bg-purple-600 hover:bg-purple-700 text-white">
                  Start Building Free
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/docs">
                <Button size="lg" variant="outline" className="border-gray-700 text-white hover:bg-gray-800">
                  <FileText className="mr-2 h-5 w-5" />
                  View Documentation
                </Button>
              </Link>
            </div>

            {/* Stats */}
            <div className="mt-16 grid grid-cols-3 gap-8 max-w-2xl mx-auto">
              <div>
                <div className="text-3xl font-bold text-white mb-1">50K+</div>
                <div className="text-sm text-gray-400">Databases Created</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-white mb-1">99.9%</div>
                <div className="text-sm text-gray-400">Uptime SLA</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-white mb-1">&lt;100ms</div>
                <div className="text-sm text-gray-400">Avg Response Time</div>
              </div>
            </div>
          </div>
        </section>

        {/* SDK Installation Section */}
        <section className="py-16 px-4 bg-gradient-to-br from-green-900/20 to-emerald-900/20">
          <div className="container mx-auto max-w-5xl">
            <div className="text-center mb-8">
              <Badge className="mb-4 bg-green-500/20 text-green-300 border-green-500/30">
                📦 Official SDK
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                PiPilot SDK for JavaScript & TypeScript
              </h2>
              <p className="text-gray-300 mb-6">
                Type-safe database operations with automatic rate limiting and retry logic
              </p>

              {/* Installation Command */}
              <div className="bg-gray-900/50 rounded-lg border border-gray-700 p-4 max-w-md mx-auto mb-8">
                <code className="text-green-400 font-mono text-sm">npm install pipilot-sdk</code>
              </div>

              {/* SDK Features */}
              <div className="grid md:grid-cols-3 gap-4 max-w-3xl mx-auto">
                <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-700/50">
                  <Code2 className="h-6 w-6 text-green-400 mx-auto mb-2" />
                  <div className="text-sm font-semibold text-white mb-1">Full TypeScript Support</div>
                  <div className="text-xs text-gray-400">Complete type definitions included</div>
                </div>
                <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-700/50">
                  <Zap className="h-6 w-6 text-yellow-400 mx-auto mb-2" />
                  <div className="text-sm font-semibold text-white mb-1">Auto Rate Limiting</div>
                  <div className="text-xs text-gray-400">Intelligent retry with backoff</div>
                </div>
                <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-700/50">
                  <Shield className="h-6 w-6 text-blue-400 mx-auto mb-2" />
                  <div className="text-sm font-semibold text-white mb-1">Type-Safe Operations</div>
                  <div className="text-xs text-gray-400">Catch errors at compile time</div>
                </div>
              </div>

              <div className="mt-6">
                <Link href="/docs">
                  <Button variant="outline" className="border-green-500/30 text-green-300 hover:bg-green-500/10">
                    <FileText className="mr-2 h-4 w-4" />
                    View SDK Documentation
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Code Example Section */}
        <section className="py-20 px-4 bg-gray-900/50">
          <div className="container mx-auto max-w-5xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Simple to use, powerful at scale
              </h2>
              <p className="text-gray-400">Get started with just a few lines of code</p>
            </div>

            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
              {/* Language Tabs */}
              <div className="flex border-b border-gray-700">
                {codeExamples.map((example, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedLanguage(index)}
                    className={`px-6 py-3 text-sm font-medium transition-colors ${selectedLanguage === index
                      ? 'text-white bg-gray-700/50 border-b-2 border-purple-500'
                      : 'text-gray-400 hover:text-white'
                      }`}
                  >
                    {example.language}
                  </button>
                ))}
              </div>

              {/* Code Block */}
              <pre className="p-6 overflow-x-auto">
                <code className="text-sm text-gray-300 font-mono">
                  {codeExamples[selectedLanguage].code}
                </code>
              </pre>
            </div>
          </div>
        </section>

        {/* MCP Server Section */}
        <section className="py-20 px-4 bg-gradient-to-br from-purple-900/20 to-blue-900/20">
          <div className="container mx-auto max-w-6xl">
            <div className="text-center mb-16">
              <Badge className="mb-4 bg-purple-500/20 text-purple-300 border-purple-500/30">
                🚀 Now Live
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                AI Assistant Integration
              </h2>
              <p className="text-xl text-gray-300 mb-8 max-w-3xl mx-auto">
                Connect your favorite AI assistants directly to your PiPilot database.
                Ask Claude, Cursor, or VS Code Copilot to query, update, and manage your data naturally.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 mb-12">
              <Card className="bg-gray-800/50 border-gray-700">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Brain className="w-5 h-5 text-purple-400" />
                    Natural Language Queries
                  </CardTitle>
                  <CardDescription>
                    Ask your AI assistant: "Show me all users from California" or "Create a new order for customer #123"
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm text-gray-300">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-400" />
                      <span>Query data with plain English</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-400" />
                      <span>Insert, update, and delete records</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-400" />
                      <span>Create tables and manage schemas</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-800/50 border-gray-700">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Server className="w-5 h-5 text-blue-400" />
                    MCP Server Ready
                  </CardTitle>
                  <CardDescription>
                    Our hosted MCP server handles authentication, rate limiting, and secure connections automatically.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm text-gray-300">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-400" />
                      <span>Hosted at pipilot-mcp-server.vercel.app</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-400" />
                      <span>Automatic API key management</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-400" />
                      <span>Works with Claude, Cursor, VS Code, Windsurf</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="text-center">
              <Link href="/docs/mcp-server-integration">
                <Button size="lg" className="bg-purple-600 hover:bg-purple-700 text-white">
                  Setup MCP Integration
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-20 px-4">
          <div className="container mx-auto max-w-6xl">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Everything you need to ship fast
              </h2>
              <p className="text-gray-400 max-w-2xl mx-auto">
                From authentication to storage, we handle the infrastructure so you can focus on building your product
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((feature, index) => (
                <Card key={index} className="bg-gray-800/50 border-gray-700 hover:border-purple-500/50 transition-colors">
                  <CardHeader>
                    <feature.icon className="h-8 w-8 text-purple-400 mb-4" />
                    <CardTitle className="text-white">{feature.title}</CardTitle>
                    <CardDescription className="text-gray-400">
                      {feature.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Free Tier Section */}
        <section className="py-20 px-4 bg-gray-900/50">
          <div className="container mx-auto max-w-4xl text-center">
            <div className="mb-8">
              <Badge className="mb-4 bg-green-500/20 text-green-300 border-green-500/30 text-lg px-4 py-2">
                🎉 Completely Free
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Start building today, no credit card required
              </h2>
              <p className="text-gray-400 mb-8 text-lg">
                Everything you need to build your application is included in our free tier.
                <br />
                Pro features coming soon for power users.
              </p>
            </div>

            <Card className="bg-gray-800/50 border-2 border-green-500/30 max-w-2xl mx-auto">
              <CardHeader>
                <CardTitle className="text-white text-2xl flex items-center justify-center gap-2">
                  <Check className="h-6 w-6 text-green-500" />
                  Free Forever
                </CardTitle>
                <CardDescription className="text-gray-400 text-center">
                  All features included at no cost
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-left">
                  <li className="flex items-start gap-3 text-gray-300">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>1 database per project (500MB each)</span>
                  </li>
                  <li className="flex items-start gap-3 text-gray-300">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>500MB file storage per database</span>
                  </li>
                  <li className="flex items-start gap-3 text-gray-300">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>Unlimited API requests</span>
                  </li>
                  <li className="flex items-start gap-3 text-gray-300">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>AI schema generation</span>
                  </li>
                  <li className="flex items-start gap-3 text-gray-300">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>Auto-generated REST APIs</span>
                  </li>
                  <li className="flex items-start gap-3 text-gray-300">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>Row Level Security</span>
                  </li>
                </ul>
                <div className="mt-8">
                  <Link href="/auth/signup">
                    <Button size="lg" className="bg-green-600 hover:bg-green-700 text-white w-full">
                      Get Started Free
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-4">
          <div className="container mx-auto max-w-4xl text-center">
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
              Ready to ship faster?
            </h2>
            <p className="text-xl text-gray-300 mb-8">
              Join thousands of developers building with our database platform
            </p>
            <Link href="/auth/signup">
              <Button size="lg" className="bg-purple-600 hover:bg-purple-700 text-white">
                Get Started Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
