"use client"

import { useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import {
  Github,
  Cloud,
  Database,
  CreditCard,
  Zap,
  Shield,
  ArrowRight,
  CheckCircle,
  Play,
  ExternalLink,
  Code,
  Settings,
  Globe,
  Server,
  Lock,
  RefreshCw,
  ChevronRight,
  Star,
  Target,
  Lightbulb,
  Rocket
} from "lucide-react"
import { usePageTitle } from '@/hooks/use-page-title'

// Custom SVG Icons (same as in account page)
const GitHubIcon = ({ className }: { className?: string }) => (
  <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className}>
    <title>GitHub</title>
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
)

const VercelIcon = ({ className }: { className?: string }) => (
  <img
    src="https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/vercel.svg"
    alt="Vercel"
    className={className}
  />
)

const NetlifyIcon = ({ className }: { className?: string }) => (
  <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className}>
    <title>Netlify</title>
    <path d="M6.49 19.04h-.23L5.13 17.9v-.23l1.73-1.71h1.2l.15.15v1.2L6.5 19.04ZM5.13 6.31V6.1l1.13-1.13h.23L8.2 6.68v1.2l-.15.15h-1.2L5.13 6.31Zm9.96 9.09h-1.65l-.14-.13v-3.83c0-.68-.27-1.2-1.1-1.23-.42 0-.9 0-1.43.02l-.07.08v4.96l-.14.14H8.9l-.13-.14V8.73l.13-.14h3.7a2.6 2.6 0 0 1 2.61 2.6v4.08l-.13.14Zm-8.37-2.44H.14L0 12.82v-1.64l.14-.14h6.58l.14.14v1.64l-.14.14Zm17.14 0h-6.58l-.14-.14v-1.64l.14-.14h6.58l.14.14v1.64l-.14.14ZM11.05 6.55V1.64l.14-.14h1.65l.14.14v4.9l-.14.14h-1.65l-.14-.13Zm0 15.81v-4.9l.14-.14h1.65l.14.13v4.91l-.14.14h-1.65l-.14-.14Z" />
  </svg>
)

const SupabaseIcon = ({ className }: { className?: string }) => (
  <img
    src="https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/supabase.svg"
    alt="Supabase"
    className={className}
  />
)
const StripeIcon = ({ className }: { className?: string }) => (
  <img
    src="https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/stripe.svg"
    alt="Stripe"
    className={className}
  />
)

const integrations = [
  {
    icon: <GitHubIcon className="w-6 h-6" />,
    title: "GitHub Integration",
    description: "Connect your GitHub repositories for seamless deployment and version control integration."
  },
  {
    icon: <VercelIcon className="w-6 h-6" />,
    title: "Vercel Deployments",
    description: "Deploy your applications directly to Vercel with automated builds and custom domains."
  },
  {
    icon: <NetlifyIcon className="w-6 h-6" />,
    title: "Netlify Hosting",
    description: "Host your sites on Netlify with continuous deployment and form handling capabilities."
  },
  {
    icon: <SupabaseIcon className="w-6 h-6" />,
    title: "Supabase Database",
    description: "Connect to Supabase for real-time databases, authentication, and backend services."
  },
  {
    icon: <StripeIcon className="w-6 h-6" />,
    title: "Stripe Payments",
    description: "Process payments, manage subscriptions, and handle billing with Stripe integration."
  },
  {
    icon: <Shield className="w-6 h-6" />,
    title: "Secure Token Storage",
    description: "All API tokens and credentials are encrypted and stored securely in your account."
  }
]

const howItWorks = [
  {
    step: 1,
    title: "Connect Your Accounts",
    description: "Go to Account Settings and connect your preferred services using API tokens or OAuth.",
    icon: <Settings className="w-8 h-8 text-orange-500" />
  },
  {
    step: 2,
    title: "Configure Projects",
    description: "Select repositories, projects, or configure API keys for each connected service.",
    icon: <Code className="w-8 h-8 text-orange-500" />
  },
  {
    step: 3,
    title: "Deploy & Integrate",
    description: "Use integrated tools to deploy, manage databases, or process payments seamlessly.",
    icon: <Rocket className="w-8 h-8 text-orange-500" />
  },
  {
    step: 4,
    title: "Monitor & Manage",
    description: "Track deployments, manage subscriptions, and monitor your integrated services.",
    icon: <Globe className="w-8 h-8 text-orange-500" />
  },
  {
    step: 5,
    title: "Scale Automatically",
    description: "Your integrations scale with your needs, from development to production environments.",
    icon: <Zap className="w-8 h-8 text-orange-500" />
  }
]

const serviceDetails = [
  {
    name: "GitHub",
    icon: <GitHubIcon className="w-8 h-8" />,
    description: "Version control, repository management, and deployment triggers",
    features: ["Repository access", "Push deployments", "Webhook integration", "Branch management"],
    color: "bg-gray-900"
  },
  {
    name: "Vercel",
    icon: <VercelIcon className="w-8 h-8" />,
    description: "Serverless deployment platform with global CDN",
    features: ["One-click deployments", "Custom domains", "Environment variables", "Build logs"],
    color: "bg-black"
  },
  {
    name: "Netlify",
    icon: <NetlifyIcon className="w-8 h-8" />,
    description: "Static site hosting with form handling and serverless functions",
    features: ["Static site hosting", "Form submissions", "Serverless functions", "Build hooks"],
    color: "bg-teal-500"
  },
  {
    name: "Supabase",
    icon: <SupabaseIcon className="w-8 h-8" />,
    description: "Open source Firebase alternative with real-time capabilities",
    features: ["Real-time database", "Authentication", "Storage", "Edge functions"],
    color: "bg-green-500"
  },
  {
    name: "Stripe",
    icon: <StripeIcon className="w-8 h-8" />,
    description: "Payment processing and subscription management",
    features: ["Payment intents", "Subscriptions", "Webhooks", "Refunds"],
    color: "bg-orange-500"
  }
]

const useCases = [
  {
    title: "Full-Stack Development",
    description: "Build complete applications with integrated databases, payments, and hosting.",
    icon: <Server className="w-6 h-6 text-orange-500" />
  },
  {
    title: "E-commerce Platforms",
    description: "Create online stores with payment processing and inventory management.",
    icon: <CreditCard className="w-6 h-6 text-green-500" />
  },
  {
    title: "SaaS Applications",
    description: "Build subscription-based apps with user management and billing.",
    icon: <Target className="w-6 h-6 text-orange-500" />
  },
  {
    title: "API-First Development",
    description: "Develop robust APIs with database integration and authentication.",
    icon: <Code className="w-6 h-6 text-orange-500" />
  }
]

export default function IntegrationsPage() {
  usePageTitle('Integrations')
  const [activeTab, setActiveTab] = useState("features")

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
      <Navigation />
      
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl" />
        </div>

        <div className="container mx-auto px-4 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center max-w-4xl mx-auto"
          >
            <Badge className="mb-4 bg-orange-500/10 text-orange-600 border-orange-500/20">
              <Zap className="w-3 h-3 mr-1" />
              Powerful Integrations
            </Badge>
            
            <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-orange-500 to-orange-600 bg-clip-text text-transparent">
              Seamless Integrations
            </h1>
            <br></br>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Connect your favorite tools and services. Deploy to Vercel or Netlify, 
              manage databases with Supabase, process payments with Stripe, and more.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/workspace/account">
                <Button size="lg" className="bg-orange-600 hover:bg-orange-500 gap-2">
                  <Settings className="w-4 h-4" />
                  Connect Services
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="gap-2" onClick={() => setActiveTab("tutorial")}>
                <Play className="w-4 h-4" />
                How It Works
              </Button>
            </div>
          </motion.div>

          {/* Service Icons Grid */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mt-16"
          >
            <div className="grid grid-cols-3 md:grid-cols-5 gap-8 max-w-2xl mx-auto">
              {serviceDetails.map((service, index) => (
                <motion.div
                  key={service.name}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="flex flex-col items-center text-center"
                >
                  <div className={`w-16 h-16 rounded-xl ${service.color} flex items-center justify-center text-white mb-3`}>
                    {service.icon}
                  </div>
                  <p className="text-sm font-medium">{service.name}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Main Content Tabs */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full max-w-2xl mx-auto grid-cols-4 mb-12">
              <TabsTrigger value="features">Features</TabsTrigger>
              <TabsTrigger value="tutorial">How It Works</TabsTrigger>
              <TabsTrigger value="services">Services</TabsTrigger>
              <TabsTrigger value="use-cases">Use Cases</TabsTrigger>
            </TabsList>

            {/* Features Tab */}
            <TabsContent value="features">
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {integrations.map((integration, index) => (
                  <motion.div
                    key={integration.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                  >
                    <Card className="h-full hover:border-orange-500/50 transition-colors">
                      <CardHeader>
                        <div className="w-12 h-12 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-500 mb-4">
                          {integration.icon}
                        </div>
                        <CardTitle className="text-lg">{integration.title}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <CardDescription>{integration.description}</CardDescription>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>

              {/* Security Note */}
              <Card className="mt-12 border-green-500/20 bg-green-500/5">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <Lock className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
                    <div>
                      <h3 className="font-semibold text-green-800 dark:text-green-200 mb-2">Enterprise-Grade Security</h3>
                      <p className="text-sm text-green-700 dark:text-green-300">
                        All integrations use encrypted token storage and follow OAuth 2.0 best practices. 
                        Your credentials are never exposed to client-side code.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tutorial Tab */}
            <TabsContent value="tutorial">
              <div className="max-w-4xl mx-auto">
                <div className="text-center mb-12">
                  <h3 className="text-2xl font-bold mb-4">Getting Started with Integrations</h3>
                  <p className="text-muted-foreground">Follow these steps to connect and use external services</p>
                </div>

                <div className="space-y-8">
                  {howItWorks.map((step, index) => (
                    <motion.div
                      key={step.step}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.5, delay: index * 0.1 }}
                      className="flex gap-6 items-start"
                    >
                      <div className="flex-shrink-0">
                        <div className="w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center relative">
                          {step.icon}
                          <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-orange-500 text-white text-xs flex items-center justify-center font-bold">
                            {step.step}
                          </span>
                        </div>
                      </div>
                      <div className="flex-1 pt-2">
                        <h4 className="text-lg font-semibold mb-2">{step.title}</h4>
                        <p className="text-muted-foreground">{step.description}</p>
                      </div>
                      {index < howItWorks.length - 1 && (
                        <ChevronRight className="w-5 h-5 text-muted-foreground self-center hidden lg:block" />
                      )}
                    </motion.div>
                  ))}
                </div>

                {/* Quick Start Guide */}
                <Card className="mt-12 border-orange-500/20 bg-orange-500/5">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lightbulb className="w-5 h-5 text-yellow-500" />
                      Quick Start Tips
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3">
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span><strong>Start with GitHub:</strong> Connect your repositories first for version control</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span><strong>Choose one host:</strong> Pick either Vercel or Netlify for deployments</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span><strong>Add Supabase:</strong> For database needs and real-time features</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span><strong>Stripe for payments:</strong> Only connect when you need payment processing</span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Services Tab */}
            <TabsContent value="services">
              <div className="max-w-6xl mx-auto">
                <div className="text-center mb-12">
                  <h3 className="text-2xl font-bold mb-4">Supported Services</h3>
                  <p className="text-muted-foreground">Detailed information about each integrated service</p>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {serviceDetails.map((service, index) => (
                    <motion.div
                      key={service.name}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: index * 0.1 }}
                    >
                      <Card className="h-full">
                        <CardHeader>
                          <div className="flex items-center gap-3">
                            <div className={`w-12 h-12 rounded-lg ${service.color} flex items-center justify-center text-white`}>
                              {service.icon}
                            </div>
                            <CardTitle className="text-xl">{service.name}</CardTitle>
                          </div>
                          <CardDescription>{service.description}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            <h4 className="font-semibold text-sm">Key Features:</h4>
                            <ul className="space-y-1">
                              {service.features.map((feature) => (
                                <li key={feature} className="flex items-center gap-2 text-sm">
                                  <CheckCircle className="w-4 h-4 text-green-500" />
                                  {feature}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>

                <Card className="mt-12">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <RefreshCw className="w-5 h-5 text-orange-500" />
                      Auto-Configuration
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="font-semibold mb-2">What Gets Configured Automatically</h4>
                        <ul className="space-y-2 text-sm">
                          <li className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            API keys and access tokens
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            Webhook endpoints and secrets
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            Environment variables
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            Project and repository connections
                          </li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-semibold mb-2">Manual Configuration Required</h4>
                        <ul className="space-y-2 text-sm">
                          <li className="flex items-center gap-2">
                            <ExternalLink className="w-4 h-4 text-orange-500" />
                            Domain settings and DNS
                          </li>
                          <li className="flex items-center gap-2">
                            <ExternalLink className="w-4 h-4 text-orange-500" />
                            Service-specific permissions
                          </li>
                          <li className="flex items-center gap-2">
                            <ExternalLink className="w-4 h-4 text-orange-500" />
                            Billing and subscription setup
                          </li>
                          <li className="flex items-center gap-2">
                            <ExternalLink className="w-4 h-4 text-orange-500" />
                            Custom webhook handlers
                          </li>
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Use Cases Tab */}
            <TabsContent value="use-cases">
              <div className="max-w-4xl mx-auto">
                <div className="text-center mb-12">
                  <h3 className="text-2xl font-bold mb-4">Perfect For</h3>
                  <p className="text-muted-foreground">Common use cases and application types</p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {useCases.map((useCase, index) => (
                    <motion.div
                      key={useCase.title}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.5, delay: index * 0.1 }}
                      className="text-center p-6 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="w-12 h-12 rounded-full bg-background flex items-center justify-center mx-auto mb-4">
                        {useCase.icon}
                      </div>
                      <h4 className="font-semibold mb-2">{useCase.title}</h4>
                      <p className="text-sm text-muted-foreground">{useCase.description}</p>
                    </motion.div>
                  ))}
                </div>

                <Card className="mt-12 border-orange-500/20 bg-orange-500/5">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Star className="w-5 h-5 text-yellow-500" />
                      Integration Examples
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <h4 className="font-semibold">E-commerce Stack</h4>
                        <ul className="text-sm space-y-1">
                          <li>• Next.js + Supabase (database)</li>
                          <li>• Stripe (payments)</li>
                          <li>• Vercel (hosting)</li>
                          <li>• GitHub (version control)</li>
                        </ul>
                      </div>
                      <div className="space-y-3">
                        <h4 className="font-semibold">SaaS Platform</h4>
                        <ul className="text-sm space-y-1">
                          <li>• React + Supabase (auth & data)</li>
                          <li>• Stripe (subscriptions)</li>
                          <li>• Netlify (hosting)</li>
                          <li>• GitHub (CI/CD)</li>
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-orange-500/10 to-orange-600/10">
        <div className="container mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Ready to Connect?
            </h2>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Start building with powerful integrations. Connect your favorite services 
              and supercharge your development workflow.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/workspace/account">
                <Button size="lg" className="bg-orange-600 hover:bg-orange-500 gap-2">
                  <Settings className="w-4 h-4" />
                  Manage Integrations
                </Button>
              </Link>
              <Link href="/workspace">
                <Button size="lg" variant="outline" className="gap-2">
                  <Code className="w-4 h-4" />
                  Start Building
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  )
}