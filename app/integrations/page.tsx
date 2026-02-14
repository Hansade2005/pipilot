"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ExternalLink,
  Github,
  Zap,
  Database,
  CreditCard,
  CheckCircle,
  ArrowRight,
  Settings,
  Shield,
  Globe,
  Code,
  Server,
  Cloud
} from "lucide-react"
import Link from "next/link"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { usePageTitle } from '@/hooks/use-page-title'

// Custom SVG Icons (matching account page)
const GitHubIcon = ({ className }: { className?: string }) => (
  <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className}>
    <title>GitHub</title>
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
)

const VercelIcon = ({ className }: { className?: string }) => (
  <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className}>
    <title>Vercel</title>
    <path d="m12 1.608 12 20.784H0Z" />
  </svg>
)

const NetlifyIcon = ({ className }: { className?: string }) => (
  <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className}>
    <title>Netlify</title>
    <path d="M6.49 19.04h-.23L5.13 17.9v-.23l1.73-1.71h1.2l.15.15v1.2L6.5 19.04ZM5.13 6.31V6.1l1.13-1.13h.23L8.2 6.68v1.2l-.15.15h-1.2L5.13 6.31Zm9.96 9.09h-1.65l-.14-.13v-3.83c0-.68-.27-1.2-1.1-1.23-.42 0-.9 0-1.43.02l-.07.08v4.96l-.14.14H8.9l-.13-.14V8.73l.13-.14h3.7a2.6 2.6 0 0 1 2.61 2.6v4.08l-.13.14Zm-8.37-2.44H.14L0 12.82v-1.64l.14-.14h6.58l.14.14v1.64l-.14.14Zm17.14 0h-6.58l-.14-.14v-1.64l.14-.14h6.58l.14.14v1.64l-.14.14ZM11.05 6.55V1.64l.14-.14h1.65l.14.14v4.9l-.14.14h-1.65l-.14-.13Zm0 15.81v-4.9l.14-.14h1.65l.14.13v4.91l-.14.14h-1.65l-.14-.14Z" />
  </svg>
)

const SupabaseIcon = ({ className }: { className?: string }) => (
  <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className}>
    <title>Supabase</title>
    <path d="M21.362 9.354H12V.396a.396.396 0 0 0-.716-.233L2.724 9.355H.642A.643.643 0 0 0 0 10v4a.64.64 0 0 0 .643.643h2.724l8.56 9.192a.396.396 0 0 0 .716-.233V14.61h9.362a.643.643 0 0 0 .643-.643v-4a.643.643 0 0 0-.643-.643Z" />
  </svg>
)

const StripeIcon = ({ className }: { className?: string }) => (
  <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className}>
    <title>Stripe</title>
    <path d="M13.976 9.15c-1.37 0-2.313.917-2.313 2.445 0 2.807 4.878 1.47 4.878 4.435 0 .871-.776 1.428-1.958 1.428-1.618 0-2.413-.854-2.413-2.165h-2.03c0 2.145 1.618 3.507 4.443 3.507 1.618 0 2.783-.661 2.783-2.445 0-2.806-4.878-1.47-4.878-4.435 0-.661.465-1.244 1.754-1.244 1.244 0 1.863.661 1.863 1.754h2.03c0-1.754-1.37-2.807-3.559-2.807zm7.024 8.85h2.03V6.22h-2.03v11.78z" />
  </svg>
)

const integrations = [
  {
    id: 'github',
    name: 'GitHub',
    icon: GitHubIcon,
    iconBg: 'bg-gray-900',
    description: 'Connect your GitHub repositories for seamless deployments and version control integration.',
    features: [
      'Automatic repository creation',
      'Push code changes directly from PiPilot',
      'GitHub Actions integration',
      'Repository management and workflows'
    ],
    useCases: [
      'Deploy applications to production',
      'Version control for your projects',
      'Collaborate with team members',
      'Automate deployment pipelines'
    ],
    setupSteps: [
      'Go to GitHub Settings → Developer settings → Personal access tokens',
      'Create a new token with repo, workflow, user, and delete_repo scopes',
      'Copy the token and paste it in your PiPilot account settings',
      'PiPilot will validate and securely store your token'
    ],
    tokenUrl: 'https://github.com/settings/tokens/new?description=PiPilot%20(repo%20workflow)&scopes=repo,workflow,user,delete_repo',
    category: 'deployment'
  },
  {
    id: 'vercel',
    name: 'Vercel',
    icon: VercelIcon,
    iconBg: 'bg-black',
    description: 'Deploy your applications to Vercel\'s global edge network with zero configuration.',
    features: [
      'Global CDN deployment',
      'Automatic SSL certificates',
      'Edge function support',
      'Real-time deployment previews'
    ],
    useCases: [
      'Deploy web applications instantly',
      'Host static sites and SPAs',
      'Serverless function deployment',
      'Preview deployments for every commit'
    ],
    setupSteps: [
      'Go to Vercel Dashboard → Account → Tokens',
      'Create a new token with appropriate permissions',
      'Copy the token and connect it in PiPilot',
      'Deploy your projects with one click'
    ],
    tokenUrl: 'https://vercel.com/account/tokens',
    category: 'deployment'
  },
  {
    id: 'netlify',
    name: 'Netlify',
    icon: NetlifyIcon,
    iconBg: 'bg-teal-500',
    description: 'Deploy modern web projects with Netlify\'s powerful platform for static sites and serverless functions.',
    features: [
      'Static site hosting',
      'Form handling and submissions',
      'Identity and authentication',
      'Large media optimization'
    ],
    useCases: [
      'Host static websites and blogs',
      'Deploy Jamstack applications',
      'Serverless function hosting',
      'E-commerce site deployment'
    ],
    setupSteps: [
      'Go to Netlify Dashboard → User settings → Applications',
      'Create a new personal access token',
      'Connect the token in your PiPilot account',
      'Deploy sites with continuous deployment'
    ],
    tokenUrl: 'https://app.netlify.com/user/applications',
    category: 'deployment'
  },
  {
    id: 'supabase',
    name: 'Supabase',
    icon: SupabaseIcon,
    iconBg: 'bg-green-600',
    description: 'Connect to Supabase for powerful database operations, authentication, and real-time features.',
    features: [
      'PostgreSQL database management',
      'Real-time subscriptions',
      'Authentication and user management',
      'File storage and edge functions'
    ],
    useCases: [
      'Build applications with real-time data',
      'User authentication and authorization',
      'File uploads and storage',
      'API development with instant APIs'
    ],
    setupSteps: [
      'Go to Supabase Dashboard → Account → API',
      'Generate a Management API token',
      'Connect the token in PiPilot settings',
      'Select your project and start building'
    ],
    tokenUrl: 'https://supabase.com/dashboard/account/tokens',
    category: 'database'
  },
  {
    id: 'stripe',
    name: 'Stripe',
    icon: StripeIcon,
    iconBg: 'bg-purple-600',
    description: 'Integrate Stripe for secure payment processing, subscriptions, and financial operations.',
    features: [
      'Payment processing and checkout',
      'Subscription management',
      'Invoice generation',
      'Financial reporting and analytics'
    ],
    useCases: [
      'Accept payments in your applications',
      'Manage recurring subscriptions',
      'Process refunds and disputes',
      'Generate financial reports'
    ],
    setupSteps: [
      'Go to Stripe Dashboard → Developers → API keys',
      'Copy your Secret key (sk_live_... or sk_test_...)',
      'Connect the key securely in PiPilot',
      'Start processing payments immediately'
    ],
    tokenUrl: 'https://dashboard.stripe.com/apikeys',
    category: 'payments'
  }
]

export default function IntegrationsPage() {
  usePageTitle('Integrations')
  const [activeTab, setActiveTab] = useState('all')

  const filteredIntegrations = activeTab === 'all'
    ? integrations
    : integrations.filter(integration => integration.category === activeTab)

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
      <Navigation />

      {/* Hero Section */}
      <section className="relative pt-24 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <div className="flex items-center justify-center mb-6">
            <div className="p-3 bg-blue-100 rounded-full">
              <Settings className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
            Integrations
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
            Connect your favorite tools and services to supercharge your development workflow.
            Deploy, manage databases, process payments, and more with seamless integrations.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/workspace/account">
              <Button size="lg" className="w-full sm:w-auto">
                <Shield className="mr-2 h-5 w-5" />
                Connect Services
              </Button>
            </Link>
            <Button variant="outline" size="lg" className="w-full sm:w-auto">
              <ExternalLink className="mr-2 h-5 w-5" />
              View Documentation
            </Button>
          </div>
        </div>
      </section>

      {/* Integrations Grid */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Filter Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-12">
            <TabsList className="grid w-full grid-cols-5 max-w-md mx-auto">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="deployment">Deploy</TabsTrigger>
              <TabsTrigger value="database">Database</TabsTrigger>
              <TabsTrigger value="payments">Payments</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Integrations Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredIntegrations.map((integration) => (
              <Card key={integration.id} className="group hover:shadow-lg transition-all duration-300 border-2 hover:border-blue-200">
                <CardHeader>
                  <div className="flex items-center justify-between mb-4">
                    <div className={`p-3 rounded-lg ${integration.iconBg}`}>
                      <integration.icon className="h-6 w-6 text-white" />
                    </div>
                    <Badge variant="secondary" className="capitalize">
                      {integration.category}
                    </Badge>
                  </div>
                  <CardTitle className="text-xl">{integration.name}</CardTitle>
                  <CardDescription className="text-base">
                    {integration.description}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-6">
                  {/* Key Features */}
                  <div>
                    <h4 className="font-semibold text-sm text-gray-900 mb-3 flex items-center">
                      <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                      Key Features
                    </h4>
                    <ul className="space-y-2">
                      {integration.features.map((feature, index) => (
                        <li key={index} className="text-sm text-gray-600 flex items-start">
                          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Use Cases */}
                  <div>
                    <h4 className="font-semibold text-sm text-gray-900 mb-3 flex items-center">
                      <Zap className="h-4 w-4 text-yellow-500 mr-2" />
                      Use Cases
                    </h4>
                    <ul className="space-y-2">
                      {integration.useCases.map((useCase, index) => (
                        <li key={index} className="text-sm text-gray-600 flex items-start">
                          <div className="w-1.5 h-1.5 bg-purple-500 rounded-full mt-2 mr-3 flex-shrink-0" />
                          {useCase}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Setup Steps */}
                  <div>
                    <h4 className="font-semibold text-sm text-gray-900 mb-3 flex items-center">
                      <ArrowRight className="h-4 w-4 text-blue-500 mr-2" />
                      Quick Setup
                    </h4>
                    <ol className="space-y-2 text-sm text-gray-600">
                      {integration.setupSteps.map((step, index) => (
                        <li key={index} className="flex items-start">
                          <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded mr-3 mt-0.5">
                            {index + 1}
                          </span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3 pt-4">
                    <Link href={integration.tokenUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" className="flex-1">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Get Token
                      </Button>
                    </Link>
                    <Link href="/workspace/account">
                      <Button size="sm" className="flex-1">
                        Connect
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Ready to Supercharge Your Workflow?
          </h2>
          <p className="text-lg text-gray-600 mb-8">
            Connect your favorite tools and start building amazing applications faster than ever.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/workspace/account">
              <Button size="lg">
                <Settings className="mr-2 h-5 w-5" />
                Manage Integrations
              </Button>
            </Link>
            <Link href="/workspace">
              <Button variant="outline" size="lg">
                <Code className="mr-2 h-5 w-5" />
                Start Building
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}