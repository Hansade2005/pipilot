"use client"

import { useState, useEffect } from "react"
import Script from "next/script"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Heart, Check, Info, ChevronDown, Star, Users, Loader2 } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { createClient } from "@/lib/supabase/client"
import { PRODUCT_CONFIGS, getPrice, getSavings, getExchangeRateForDisplay } from "@/lib/stripe-config"
import { convertUsdToCad, formatPrice } from "@/lib/currency-converter"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PaymentProviderSelector } from "@/components/pricing/payment-provider-selector"
import { CreditTopUpSelector } from "@/components/billing/credit-topup-selector"
import { usePageTitle } from '@/hooks/use-page-title'

export default function PricingPage() {
  usePageTitle('Pricing')
  const [isAnnual, setIsAnnual] = useState(false)
  const [openFAQ, setOpenFAQ] = useState<number | null>(null)
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const [user, setUser] = useState<any>(null)
  const [currentPlan, setCurrentPlan] = useState<string>('free')
  const [creditBalance, setCreditBalance] = useState<number>(0)
  const [canPurchaseCredits, setCanPurchaseCredits] = useState<boolean>(false)
  const [exchangeRate, setExchangeRate] = useState<number>(1.35)
  const [showPaymentDialog, setShowPaymentDialog] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<"creator" | "collaborate" | "scale" | null>(null)
  const [showCreditDialog, setShowCreditDialog] = useState(false)
  const [selectedCredits, setSelectedCredits] = useState<number>(0)

  const supabase = createClient()

  useEffect(() => {
    // Check authentication status
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      if (user) {
        // Fetch current subscription and credits from wallet table
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()

        const { data: wallet, error: walletError } = await supabase
          .from('wallet')
          .select('current_plan, credits_balance')
          .eq('user_id', user.id)
          .single()

        if (!walletError && wallet) {
          setCurrentPlan(wallet.current_plan || 'free')
          setCreditBalance(wallet.credits_balance || 0)

          // Check if user can purchase credits (paid plans only)
          const { canPurchaseCredits: canBuy } = await import('@/lib/stripe-config')
          setCanPurchaseCredits(canBuy(wallet.current_plan))
        } else {
          setCurrentPlan('free')
          setCreditBalance(20) // Default free credits
          setCanPurchaseCredits(false)
        }
      }
    }

    const fetchExchangeRate = async () => {
      try {
        const rate = await getExchangeRateForDisplay()
        setExchangeRate(rate)
      } catch (error) {
        console.error('Error fetching exchange rate:', error)
        setExchangeRate(1.35)
      }
    }

    checkUser()
    fetchExchangeRate()

    // Check for success/cancel parameters
    const urlParams = new URLSearchParams(window.location.search)
    const sessionId = urlParams.get('session_id')

    if (urlParams.get('success') === 'true' && sessionId) {
      // Handle successful payment - verify the session
      handlePaymentSuccess(sessionId)
    } else if (urlParams.get('canceled') === 'true') {
      // Handle canceled payment
      console.log('Payment canceled')
      // You could show a toast notification here
    }
  }, [])

  const handlePaymentSuccess = async (sessionId: string) => {
    try {
      console.log('Verifying payment session:', sessionId)

      const response = await fetch('/api/stripe/verify-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId }),
      })

      if (response.ok) {
        const result = await response.json()
        console.log('Payment verified successfully:', result)

        // Update current plan state
        setCurrentPlan(result.plan)

        // Clean up URL
        const url = new URL(window.location.href)
        url.searchParams.delete('success')
        url.searchParams.delete('session_id')
        window.history.replaceState({}, '', url.toString())

        // You could show a success toast here
        alert(`Welcome to PiPilot ${result.plan}! Your subscription is now active.`)
      } else {
        console.error('Payment verification failed')
        alert('There was an issue verifying your payment. Please contact support.')
      }
    } catch (error) {
      console.error('Error verifying payment:', error)
      alert('There was an error verifying your payment. Please contact support.')
    }
  }

  const handleSubscribe = async (planType: string) => {
    if (!user) {
      // Redirect to login if not authenticated
      window.location.href = '/auth/login?redirect=/pricing'
      return
    }

    // Map plan types to our plan names
    const planMap: Record<string, "creator" | "collaborate" | "scale"> = {
      'pro': 'creator',
      'teams': 'collaborate',
      'enterprise': 'scale',
      'creator': 'creator',
      'collaborate': 'collaborate',
      'scale': 'scale',
    }

    const mappedPlan = planMap[planType]
    if (!mappedPlan) {
      console.error('Invalid plan type:', planType)
      return
    }

    // Show payment provider selection dialog
    setSelectedPlan(mappedPlan)
    setShowPaymentDialog(true)
  }

  const handlePurchaseCredits = async (credits: number) => {
    if (!user) {
      window.location.href = '/auth/login?redirect=/pricing'
      return
    }

    if (!canPurchaseCredits) {
      alert('Credit purchases are only available for paid plans.')
      return
    }

    // Show credit purchase dialog with payment provider options
    setSelectedCredits(credits)
    setShowCreditDialog(true)
  }

  const faqData = [
    {
      question: "What is PiPilot and how does it work?",
      answer: "PiPilot is an AI-powered development platform that helps you build web applications faster. Simply describe what you want to build, and our AI generates the code, handles the setup, and deploys your project automatically."
    },
    {
      question: "What does the free plan include?",
      answer: "The free plan includes 200 credits (~20 messages), access to Mistral Devstral 2, Google Gemini 2.5 Flash, and Claude Sonnet 4.5, Vercel deployment, visual editing, GitHub sync, and 1 app/project. It's perfect for trying out PiPilot and building small projects."
    },
    {
      question: "What deployment platforms are available?",
      answer: "Free users can deploy to Vercel only. Creator and above get access to both Vercel and Netlify for maximum flexibility."
    },
    {
      question: "What AI models are available?",
      answer: "PiPilot supports leading AI models including OpenAI GPT, Claude, Gemini, and xAI. Free users have basic access with limits, while paid plans get unlimited access to all premium models."
    },
    {
      question: "What are the credit and message limits?",
      answer: "Free: 200 credits (~20 messages). Creator: 1,500 credits (~150 messages). Collaborate: 2,500 credits (~250 messages). Scale: 6,000 credits (~600 messages). Paid users can purchase extra credits."
    },
    {
      question: "What does 'credits' mean?",
      answer: "Credits are used for AI requests based on actual token usage (1 credit = $0.01). Costs vary by message complexity and model used (~10 credits average per message). Free users cannot buy extra credits and must upgrade when exhausted."
    },
    {
      question: "Who owns the projects and code?",
      answer: "You own 100% of your projects and code. All generated code is yours to use, modify, and distribute as you see fit. We don't claim any ownership over your creations."
    },
    {
      question: "How much does it cost to use?",
      answer: "PiPilot offers a free tier with 200 credits (~20 messages). Creator is $15/month (1,500 credits), Collaborate $25/month (2,500 credits), Scale $60/month (6,000 credits). Annual plans save 20%. Costs vary by message complexity."
    },
    {
      question: "Can I upgrade or downgrade my plan?",
      answer: "Yes! You can upgrade at any time. Your billing will be prorated accordingly."
    },
    {
      question: "Where can I find out more?",
      answer: "You can learn more about PiPilot by visiting our documentation, joining our community Discord, or contacting our support team. We also have tutorials and examples to help you get started."
    }
  ]

  // Generate pricing tiers from configuration
  const pricingTiers = Object.values(PRODUCT_CONFIGS).map(config => {
    const monthlyPrice = config.prices.monthly.amount
    const yearlyPrice = config.prices.yearly.amount
    const currentPrice = isAnnual ? yearlyPrice : monthlyPrice
    const cadPrice = convertUsdToCad(currentPrice, exchangeRate)
    const cadPriceFormatted = formatPrice(cadPrice, 'CAD')
    const originalPrice = isAnnual ? null : (yearlyPrice > 0 ? formatPrice(convertUsdToCad(yearlyPrice, exchangeRate), 'CAD') : null)
    const savings = getSavings(config.id, isAnnual)

    return {
      name: config.name,
      description: config.description,
      price: config.id === 'enterprise' ? "Coming Soon" : (currentPrice === 0 ? "$0.00 CAD" : cadPriceFormatted),
      priceAmount: config.id === 'enterprise' ? undefined : (config.id === 'enterprise' ? cadPriceFormatted : undefined),
      originalPrice: originalPrice,
      period: config.id === 'enterprise' ? undefined : (isAnnual ? "per user / year" : "per user / month"),
      savings: savings,
      note: config.id === 'pro' ? "Most Popular" : (config.id === 'free' ? "Perfect for getting started" : (config.id === 'enterprise' ? "Coming Soon" : undefined)),
      buttonText: currentPlan === config.id ? "Current Plan" : (config.id === 'free' ? "Get Started" : "Select plan"),
      buttonVariant: "default" as const,
      isPopular: config.id === 'pro',
      planType: config.id,
      stripePriceId: isAnnual ? config.prices.yearly.stripePriceId : config.prices.monthly.stripePriceId,
      features: config.features
    }
  })

  return (
    <>
      {/* Stripe.js script */}
      <Script
        src="https://js.stripe.com/v3/pricing.js"
        strategy="afterInteractive"
      />

    <div className="min-h-screen relative overflow-hidden">
      {/* Enhanced Gradient Background */}
      <div className="absolute inset-0 lovable-gradient" />
      
      {/* Noise Texture Overlay */}
      <div className="absolute inset-0 noise-texture" />

      {/* Navigation */}
      <Navigation />

      {/* Main Content */}
      <main className="relative z-10 pt-16 pb-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {/* Hero Section */}
          <div className="text-center mb-16">
            <div className="flex items-center justify-center mb-4">
              <div className="w-6 h-6 rounded-full heart-gradient flex items-center justify-center">
                <Heart className="w-3 h-3 text-white fill-current" />
              </div>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 animate-fade-in">
              Ship Faster. Build Smarter. Scale Further.
            </h1>
            <p className="text-xl md:text-2xl text-white/90 max-w-3xl mx-auto leading-relaxed">
              Join thousands of developers building production-ready apps with AI. 
              <span className="block mt-2 text-purple-300 font-semibold">From prototype to deployment in minutes, not months.</span>
            </p>
            
            {/* Social Proof */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-white/70">
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                <span className="font-medium">4.9/5 rating</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-400" />
                <span className="font-medium">10,000+ developers</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-green-400" />
                <span className="font-medium">50,000+ apps deployed</span>
              </div>
            </div>
            
            {/* Currency Indicator */}
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-white/60">
              <span>💵 Prices in CAD • 1 USD = ${exchangeRate.toFixed(2)} CAD</span>
            </div>

            {/* E2B Sponsor Badge */}
            <div className="mt-6 flex items-center justify-center">
              <a href="https://e2b.dev/startups" target="_blank" rel="noopener noreferrer" className="opacity-80 hover:opacity-100 transition-opacity">
                <img src="/e2b-badge.svg" alt="Sponsored by E2B for Startups" className="h-8 md:h-10 w-auto rounded" />
              </a>
            </div>
          </div>

          {/* Value Proposition Banner */}
          <div className="mb-12 max-w-4xl mx-auto">
            <div className="bg-gradient-to-r from-purple-600/20 to-pink-600/20 border border-purple-500/30 rounded-2xl p-6 backdrop-blur-sm transform transition-all duration-300 hover:scale-105">
              <div className="grid md:grid-cols-3 gap-6 text-center">
                <div className="space-y-2">
                  <div className="text-3xl font-bold text-white">10x</div>
                  <div className="text-sm text-white/80">Faster Development</div>
                </div>
                <div className="space-y-2">
                  <div className="text-3xl font-bold text-white">90%</div>
                  <div className="text-sm text-white/80">Less Code to Write</div>
                </div>
                <div className="space-y-2">
                  <div className="text-3xl font-bold text-white">$0</div>
                  <div className="text-sm text-white/80">Setup Costs</div>
                </div>
              </div>
            </div>
          </div>

          {/* Pricing Toggle */}
          <div className="flex items-center justify-center mb-12">
            <div className="flex items-center space-x-4 bg-gray-800/50 rounded-lg p-2 backdrop-blur-sm">
              <span className={`text-sm ${!isAnnual ? 'text-white' : 'text-gray-400'}`}>Monthly</span>
              <Switch
                checked={isAnnual}
                onCheckedChange={setIsAnnual}
                className="data-[state=checked]:bg-purple-600"
              />
              <span className={`text-sm ${isAnnual ? 'text-white' : 'text-gray-400'}`}>Annual</span>
              {isAnnual && (
                <Badge className="bg-green-600 text-white text-xs">
                  Save Big!
                </Badge>
              )}
            </div>
          </div>

          {/* Pricing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            {pricingTiers.map((tier, index) => (
              <Card key={index} className={`bg-gradient-to-br from-gray-800/60 to-gray-900/60 border-gray-700/50 backdrop-blur-sm relative transform transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/20 ${tier.isPopular ? 'ring-2 ring-purple-500 shadow-lg shadow-purple-500/30 scale-105' : 'hover:border-purple-500/50'} animate-slide-up`} style={{animationDelay: `${index * 100}ms`}}>
                {tier.isPopular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-10">
                    <Badge className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-1.5 shadow-lg animate-pulse">
                      ⭐ Most Popular
                    </Badge>
                  </div>
                )}
                <CardHeader className="pb-4">
                  <CardTitle className="text-white text-xl">{tier.name}</CardTitle>
                  <CardDescription className="text-gray-300 text-sm">
                    {tier.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <div className="flex items-baseline space-x-2">
                      <span className="text-4xl font-bold bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent">{tier.price}</span>
                      {tier.priceAmount && (
                        <span className="text-4xl font-bold bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent">{tier.priceAmount}</span>
                      )}
                      {tier.period && (
                        <span className="text-gray-400 text-sm">{tier.period}</span>
                      )}
                    </div>

                    {/* Show crossed out yearly price when on monthly */}
                    {tier.originalPrice && !isAnnual && (
                      <div className="flex items-center space-x-2 mt-1">
                        <span className="text-lg text-gray-500 line-through">{tier.originalPrice}/year</span>
                        {tier.savings && (
                          <span className="text-sm text-green-400 font-medium">{tier.savings}</span>
                        )}
                      </div>
                    )}

                    {/* Show savings badge when on yearly */}
                    {tier.savings && isAnnual && (
                      <div className="mt-2">
                        <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-semibold bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg animate-bounce-slow">
                          {tier.savings}
                        </span>
                      </div>
                    )}

                    {tier.note && (
                      <p className="text-sm text-gray-400 mt-1">{tier.note}</p>
                    )}
                  </div>

                  <Button 
                    className={`w-full font-semibold transition-all duration-300 ${tier.buttonVariant === 'default' ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-lg hover:shadow-purple-500/50 transform hover:-translate-y-0.5' : 'border-2 border-gray-600 hover:border-purple-500 hover:bg-purple-500/10'} ${tier.isPopular ? 'ring-2 ring-purple-400 ring-offset-2 ring-offset-gray-900' : ''}`}
                    disabled={
                      loadingPlan === tier.planType ||
                      tier.buttonText === "Current Plan"
                    }
                    onClick={() => {
                      if (tier.planType === 'free') {
                        window.location.href = '/auth/signup'
                      } else if (tier.planType !== 'free') {
                        handleSubscribe(tier.planType)
                      }
                    }}
                  >
                    {loadingPlan === tier.planType && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {tier.buttonText}
                  </Button>

                  <div className="space-y-3">
                    {tier.features.map((feature, featureIndex) => (
                      <div key={featureIndex} className="flex items-start space-x-3">
                        <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-gray-300">{feature}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>


          {/* Extra Credits Section - Only show for paid users */}
          {user && canPurchaseCredits && (
            <div className="mb-16">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-white mb-4">Need More Credits?</h2>
                <p className="text-xl text-white/80">
                  Purchase additional credits for your {currentPlan} plan
                </p>
                <div className="mt-4 p-4 bg-gray-800/50 rounded-lg backdrop-blur-sm border border-gray-700/50 inline-block">
                  <p className="text-white">
                    Current Balance: <span className="font-bold text-purple-400">{creditBalance} credits</span>
                    <span className="text-gray-400 ml-2">(~{Math.floor(creditBalance / 10)} messages remaining)</span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
                {[
                  { credits: 1000, price: 10, messages: 100 },
                  { credits: 2500, price: 25, messages: 250 },
                  { credits: 5000, price: 50, messages: 500 }
                ].map(({ credits, price, messages }) => (
                  <Card key={credits} className="bg-gray-800/50 border-gray-700/50 backdrop-blur-sm">
                    <CardHeader className="text-center pb-4">
                      <CardTitle className="text-white text-2xl">{credits.toLocaleString()} Credits</CardTitle>
                      <CardDescription className="text-gray-300">
                        ${price} • ~{messages} messages
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="text-center">
                      <Button
                        className="w-full bg-purple-600 hover:bg-purple-700"
                        disabled={loadingPlan === 'credits'}
                        onClick={() => handlePurchaseCredits(credits)}
                      >
                        {loadingPlan === 'credits' && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Purchase Credits
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}


          {/* Refund Policy Section */}
          <div className="mb-16">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-white mb-4">Refund Policy</h2>
                <p className="text-xl text-white/80">
                  Clear terms to ensure a fair experience for everyone
                </p>
              </div>

              <div className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 border border-gray-700/50 rounded-2xl p-8 backdrop-blur-sm">
                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                      <Info className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-2">Non-Refundable After Use</h3>
                      <p className="text-gray-300 text-sm">All subscriptions are <strong className="text-white">non-refundable once credits have been used</strong>. Credits are consumed immediately upon AI interactions.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                      <Check className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-2">24-Hour Satisfaction Window</h3>
                      <p className="text-gray-300 text-sm">If you're unsatisfied and <strong className="text-white">have not used any credits</strong>, contact <a href="mailto:support@pipilot.dev" className="text-purple-400 hover:underline">support@pipilot.dev</a> within <strong className="text-white">24 hours</strong> of purchase for a full refund.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                      <Info className="w-5 h-5 text-red-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-2">Chargeback Policy</h3>
                      <p className="text-gray-300 text-sm"><strong className="text-white">Chargebacks on legitimate transactions will result in permanent account termination.</strong> Please contact support first to resolve any billing issues.</p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-700/50 mt-6 pt-6">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-center sm:text-left">
                      <p className="text-gray-400 text-sm">
                        Questions? Contact <a href="mailto:support@pipilot.dev" className="text-purple-400 hover:underline">support@pipilot.dev</a>
                      </p>
                    </div>
                    <a
                      href="/refund-policy"
                      className="inline-flex items-center text-purple-400 hover:text-purple-300 font-medium text-sm transition-colors"
                    >
                      View Full Refund Policy
                      <ChevronDown className="w-4 h-4 ml-1 -rotate-90" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* FAQ Section */}
          <div className="mb-16">
            <h2 className="text-3xl font-bold text-white mb-8 text-center">Frequently Asked Questions</h2>
            <div className="space-y-4 max-w-3xl mx-auto">
              {faqData.map((faq, index) => (
                <div key={index} className="bg-gray-800/50 rounded-lg backdrop-blur-sm border border-gray-700/50 overflow-hidden">
                  <div 
                    className="flex items-center justify-between cursor-pointer p-4 hover:bg-gray-700/50 transition-colors"
                    onClick={() => setOpenFAQ(openFAQ === index ? null : index)}
                  >
                    <span className="text-white font-medium pr-4">{faq.question}</span>
                    <ChevronDown 
                      className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${
                        openFAQ === index ? 'rotate-180' : ''
                      }`} 
                    />
                  </div>
                  {openFAQ === index && (
                    <div className="px-4 pb-4">
                      <div className="text-gray-300 leading-relaxed">
                        {faq.answer}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <Footer />

      {/* Payment Provider Selection Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Choose Payment Method</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {selectedPlan && (
              <PaymentProviderSelector 
                plan={selectedPlan} 
                onClose={() => setShowPaymentDialog(false)}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Credit Purchase Dialog */}
      <Dialog open={showCreditDialog} onOpenChange={setShowCreditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Purchase Credits</DialogTitle>
          </DialogHeader>
          <CreditTopUpSelector 
            credits={selectedCredits} 
            onClose={() => setShowCreditDialog(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
    </>
  )
}
