import { Metadata } from 'next'
import Link from 'next/link'
import { CheckCircle, Zap, Users, Globe, Database, Code, Smartphone, Shield, ClipboardList, FolderOpen, Key } from 'lucide-react'

export const metadata: Metadata = {
  title: 'PiPilot Features: AI-Powered App Builder with Advanced Tools | Build Apps with AI',
  description: 'Explore PiPilot features: AI app builder with visual editor, database, teams, enterprise solutions. Build full apps by chatting with AI.',
  keywords: 'PiPilot features, AI app builder features, visual editor, database, teams, enterprise, no-code development',
  openGraph: {
    title: 'PiPilot Features | AI App Builder',
    description: 'Discover all PiPilot features for building apps with AI. Visual editor, database, teams, and more.',
  },
}

export default function FeaturesPage() {
  const features = [
    {
      icon: <Zap className="w-8 h-8 text-yellow-500" />,
      title: "AI-Powered Development",
      description: "Build complete applications by simply describing them in natural language. No coding required.",
      details: ["Conversational app creation", "Intelligent code generation", "Auto-optimization", "Smart suggestions"]
    },
    {
      icon: <Code className="w-8 h-8 text-orange-500" />,
      title: "Visual Editor",
      description: "Drag-and-drop interface for designing beautiful user interfaces with real-time preview.",
      details: ["Component library", "Responsive design", "Custom styling", "Live preview"]
    },
    {
      icon: <Database className="w-8 h-8 text-green-500" />,
      title: "Built-in Database",
      description: "Powerful database system with automatic schema generation and data management.",
      details: ["AI schema generation", "PostgreSQL backend", "Real-time subscriptions", "Row-level security"]
    },
    {
      icon: <Users className="w-8 h-8 text-orange-500" />,
      title: "Team Collaboration",
      description: "Work together in real-time with your team members on projects and deployments.",
      details: ["Real-time editing", "Role-based access", "Version control", "Comment system"]
    },
    {
      icon: <Globe className="w-8 h-8 text-orange-500" />,
      title: "Instant Deployment",
      description: "Deploy your apps instantly to the web with automatic hosting and scaling.",
      details: ["Vercel integration", "Netlify support", "Global CDN", "Auto-scaling"]
    },
    {
      icon: <Smartphone className="w-8 h-8 text-orange-500" />,
      title: "Multi-Framework Support",
      description: "Build with Next.js, Vite+React, or Expo for web and mobile applications.",
      details: ["Next.js App Router", "Vite+React SPA", "Expo mobile apps", "Framework migration"]
    },
    {
      icon: <Shield className="w-8 h-8 text-red-500" />,
      title: "Enterprise Security",
      description: "Bank-level security with enterprise features for large organizations.",
      details: ["OAuth 2.0 auth", "Encrypted storage", "Audit logging", "GDPR compliance"]
    },
    {
      icon: <CheckCircle className="w-8 h-8 text-orange-500" />,
      title: "Advanced Integrations",
      description: "Connect with GitHub, Supabase, Stripe, and more for complete development workflow.",
      details: ["GitHub version control", "Supabase backend", "Stripe payments", "Tavily web search"]
    },
    {
      icon: <ClipboardList className="w-8 h-8 text-orange-500" />,
      title: "Project Plan",
      description: "AI generates structured implementation plans and tracks progress step by step as it builds your app.",
      details: ["Auto-generated build plans", "Real-time step tracking", "Session-persistent progress", "Resume interrupted builds"]
    },
    {
      icon: <FolderOpen className="w-8 h-8 text-amber-500" />,
      title: "Project Context",
      description: "Automatic project documentation that helps the AI understand your codebase across sessions.",
      details: ["Auto-generated project docs", "Tech stack awareness", "Cross-session continuity", "Architecture documentation"]
    },
    {
      icon: <Key className="w-8 h-8 text-orange-500" />,
      title: "BYOK (Bring Your Own Key)",
      description: "Connect your own AI provider API keys to unlock additional models and use your own accounts.",
      details: ["7+ built-in providers", "100+ models via OpenRouter", "Custom provider support", "Local-only key storage"]
    }
  ]

  return (
    <div className="container mx-auto px-4 py-16">
      <div className="text-center mb-16">
        <h1 className="text-5xl font-bold mb-6">PiPilot Features</h1>
        <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
          Discover the powerful features that make PiPilot the leading AI app builder.
          Build production-ready applications faster than ever before.
        </p>
        <Link href="/" className="bg-orange-600 text-white px-8 py-4 rounded-lg text-lg hover:bg-orange-500 transition-colors">
          Start Building Free
        </Link>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
        {features.map((feature, index) => (
          <div key={index} className="bg-white p-6 rounded-lg shadow-lg hover:shadow-xl transition-shadow">
            <div className="mb-4">{feature.icon}</div>
            <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
            <p className="text-gray-600 mb-4">{feature.description}</p>
            <ul className="space-y-2">
              {feature.details.map((detail, detailIndex) => (
                <li key={detailIndex} className="flex items-center text-sm text-gray-500">
                  <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                  {detail}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="bg-gradient-to-r from-orange-50 to-orange-100 p-12 rounded-lg text-center">
        <h2 className="text-3xl font-bold mb-6">Ready to Experience All Features?</h2>
        <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
          Join thousands of developers who are building amazing apps with PiPilot's comprehensive feature set.
          Start with our free tier and upgrade as you grow.
        </p>
        <div className="space-x-4">
          <Link href="/pricing" className="bg-orange-600 text-white px-8 py-4 rounded-lg text-lg hover:bg-orange-500 transition-colors">
            View Pricing
          </Link>
          <Link href="/showcase" className="bg-gray-500 text-white px-8 py-4 rounded-lg text-lg hover:bg-gray-600 transition-colors">
            See Examples
          </Link>
        </div>
      </div>
    </div>
  )
}