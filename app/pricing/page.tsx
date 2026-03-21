"use client"

import { useState, useEffect } from "react"
import Script from "next/script"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Check, ChevronDown, Star, Users, Loader2, Sparkles, Shield, Zap, Globe } from "lucide-react"
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
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      if (user) {
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

          const { canPurchaseCredits: canBuy } = await import('@/lib/stripe-config')
          setCanPurchaseCredits(canBuy(wallet.current_plan))
        } else {
          setCurrentPlan('free')
          setCreditBalance(20)
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

    const urlParams = new URLSearchParams(window.location.search)
    const sessionId = urlParams.get('session_id')

    if (urlParams.get('success') === 'true' && sessionId) {
      handlePaymentSuccess(sessionId)
    } else if (urlParams.get('canceled') === 'true') {
      console.log('Payment canceled')
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

        setCurrentPlan(result.plan)

        const url = new URL(window.location.href)
        url.searchParams.delete('success')
        url.searchParams.delete('session_id')
        window.history.replaceState({}, '', url.toString())

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
      window.location.href = '/auth/login?redirect=/pricing'
      return
    }

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
      answer: "The free plan includes 150 credits (~5-10 messages), access to select AI models, Vercel deployment, visual editing, GitHub sync, and 1 app/project. It's perfect for trying out PiPilot."
    },
    {
      question: "What does 'credits' mean?",
      answer: "Credits are used for AI requests based on actual token usage (1 credit = $0.01). Costs vary by message complexity and AI model chosen. Cheaper models like Gemini Flash use fewer credits, while Claude Sonnet uses more. Paid users can purchase extra credits anytime."
    },
    {
      question: "What AI models are available?",
      answer: "PiPilot supports leading AI models including OpenAI GPT, Claude, Gemini, and xAI. Free users have access to select models, while paid plans unlock all premium models."
    },
    {
      question: "What are browser testing, code review, and health check?",
      answer: "Creator and above plans include AI-powered browser testing with screenshots, automated code review with security audits, and project health checks with diagnostics. These tools help you ship production-ready apps with confidence."
    },
    {
      question: "Who owns the projects and code?",
      answer: "You own 100% of your projects and code. All generated code is yours to use, modify, and distribute as you see fit. We don't claim any ownership over your creations."
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

  // Plan highlight features (shown as badges above features list)
  const planHighlights: Record<string, { icon: React.ReactNode; label: string }[]> = {
    free: [
      { icon: <Zap className="w-3.5 h-3.5" />, label: "150 credits/mo" },
    ],
    creator: [
      { icon: <Zap className="w-3.5 h-3.5" />, label: "1,000 credits/mo" },
      { icon: <Shield className="w-3.5 h-3.5" />, label: "Code review" },
      { icon: <Globe className="w-3.5 h-3.5" />, label: "Browser testing" },
    ],
    collaborate: [
      { icon: <Zap className="w-3.5 h-3.5" />, label: "2,500 credits/mo" },
      { icon: <Users className="w-3.5 h-3.5" />, label: "Team sharing" },
    ],
    scale: [
      { icon: <Zap className="w-3.5 h-3.5" />, label: "5,000 credits/mo" },
      { icon: <Sparkles className="w-3.5 h-3.5" />, label: "Priority access" },
    ],
  }

  // Generate pricing tiers from configuration
  const pricingTiers = Object.values(PRODUCT_CONFIGS).map(config => {
    const monthlyPrice = config.prices.monthly.amount
    const yearlyPrice = config.prices.yearly.amount
    const currentPrice = isAnnual ? yearlyPrice : monthlyPrice
    const cadPrice = convertUsdToCad(currentPrice, exchangeRate)
    const cadPriceFormatted = formatPrice(cadPrice, 'CAD')
    const savings = getSavings(config.id, isAnnual)

    return {
      name: config.name,
      description: config.description,
      price: currentPrice === 0 ? "$0" : cadPriceFormatted,
      period: isAnnual ? "/year" : "/month",
      savings: savings,
      buttonText: currentPlan === config.id ? "Current Plan" : (config.id === 'free' ? "Get Started" : "Select Plan"),
      isPopular: config.id === 'creator',
      isCurrent: currentPlan === config.id,
      planType: config.id,
      stripePriceId: isAnnual ? config.prices.yearly.stripePriceId : config.prices.monthly.stripePriceId,
      features: config.features,
      highlights: planHighlights[config.id] || [],
    }
  })

  return (
    <>
      <Script
        src="https://js.stripe.com/v3/pricing.js"
        strategy="afterInteractive"
      />

    <div className="min-h-screen bg-gray-950">
      <Navigation />

      <main className="relative z-10 pt-20 pb-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">

          {/* Hero */}
          <div className="text-center mb-14">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-5 tracking-tight">
              Simple, transparent pricing
            </h1>
            <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
              Start free. Upgrade when you need more power.
              <span className="block mt-1 text-orange-400 font-medium">1 credit = $0.01 USD. Only pay for what you use.</span>
            </p>

            {/* Social proof */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-5 text-sm text-gray-500">
              <div className="flex items-center gap-1.5">
                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                <span>4.9/5 rating</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-orange-500" />
                <span>10,000+ developers</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="w-4 h-4 text-green-500" />
                <span>50,000+ apps deployed</span>
              </div>
            </div>

            <div className="mt-3 text-xs text-gray-600">
              Prices shown in CAD (1 USD = {exchangeRate.toFixed(2)} CAD)
            </div>
          </div>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center mb-10">
            <div className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-full px-5 py-2.5">
              <span className={`text-sm font-medium transition-colors ${!isAnnual ? 'text-white' : 'text-gray-500'}`}>Monthly</span>
              <Switch
                checked={isAnnual}
                onCheckedChange={setIsAnnual}
                className="data-[state=checked]:bg-orange-600"
              />
              <span className={`text-sm font-medium transition-colors ${isAnnual ? 'text-white' : 'text-gray-500'}`}>Annual</span>
              {isAnnual && (
                <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-xs font-medium">
                  Save up to 20%
                </Badge>
              )}
            </div>
          </div>

          {/* Pricing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-20">
            {pricingTiers.map((tier, index) => (
              <div
                key={index}
                className={`relative rounded-2xl border p-6 flex flex-col transition-all duration-200 ${
                  tier.isPopular
                    ? 'border-orange-500/50 bg-gradient-to-b from-orange-500/5 to-gray-900 shadow-lg shadow-orange-500/10 ring-1 ring-orange-500/20'
                    : tier.isCurrent
                    ? 'border-orange-500/30 bg-gray-900'
                    : 'border-gray-800 bg-gray-900 hover:border-gray-700'
                }`}
              >
                {/* Popular badge */}
                {tier.isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-orange-600 text-white px-3 py-0.5 text-xs font-semibold shadow-lg shadow-orange-500/20">
                      Most Popular
                    </Badge>
                  </div>
                )}

                {/* Header */}
                <div className="mb-5">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-semibold text-white">{tier.name}</h3>
                    {tier.isCurrent && (
                      <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-xs">
                        Current
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">{tier.description}</p>
                </div>

                {/* Price */}
                <div className="mb-5">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-white">{tier.price}</span>
                    <span className="text-sm text-gray-500">{tier.period}</span>
                  </div>
                  {tier.savings && isAnnual && (
                    <p className="text-xs text-green-400 font-medium mt-1">{tier.savings}</p>
                  )}
                </div>

                {/* CTA Button */}
                <Button
                  className={`w-full mb-5 font-medium transition-all ${
                    tier.isPopular
                      ? 'bg-orange-600 hover:bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                      : tier.isCurrent
                      ? 'bg-gray-800 text-gray-400 cursor-not-allowed'
                      : tier.planType === 'free'
                      ? 'bg-gray-800 hover:bg-gray-700 text-white'
                      : 'bg-orange-600 hover:bg-orange-500 text-white'
                  }`}
                  disabled={
                    loadingPlan === tier.planType ||
                    tier.isCurrent
                  }
                  onClick={() => {
                    if (tier.planType === 'free') {
                      window.location.href = '/auth/signup'
                    } else {
                      handleSubscribe(tier.planType)
                    }
                  }}
                >
                  {loadingPlan === tier.planType && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {tier.buttonText}
                </Button>

                {/* Highlight badges */}
                {tier.highlights.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {tier.highlights.map((h, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 text-xs font-medium text-orange-300 bg-orange-500/10 rounded-full px-2.5 py-1"
                      >
                        {h.icon}
                        {h.label}
                      </span>
                    ))}
                  </div>
                )}

                {/* Features */}
                <div className="space-y-2.5 flex-1">
                  {tier.features.map((feature, featureIndex) => (
                    <div key={featureIndex} className="flex items-start gap-2.5">
                      <Check className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-gray-300 leading-snug">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Extra Credits Section */}
          {user && canPurchaseCredits && (
            <div className="mb-20">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-white mb-2">Need More Credits?</h2>
                <p className="text-gray-400">
                  Top up your {currentPlan} plan anytime at $0.01/credit
                </p>
                <div className="mt-3 inline-flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-full px-4 py-2 text-sm">
                  <span className="text-gray-400">Balance:</span>
                  <span className="font-semibold text-orange-400">{creditBalance} credits</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto">
                {[
                  { credits: 1000, price: 10 },
                  { credits: 2500, price: 25 },
                  { credits: 5000, price: 50 }
                ].map(({ credits, price }) => (
                  <div key={credits} className="rounded-xl border border-gray-800 bg-gray-900 p-5 text-center hover:border-gray-700 transition-colors">
                    <div className="text-2xl font-bold text-white mb-1">{credits.toLocaleString()}</div>
                    <div className="text-sm text-gray-500 mb-4">credits for ${price}</div>
                    <Button
                      className="w-full bg-orange-600 hover:bg-orange-500 text-white"
                      disabled={loadingPlan === 'credits'}
                      onClick={() => handlePurchaseCredits(credits)}
                    >
                      {loadingPlan === 'credits' && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Purchase
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sponsor Badges */}
          <div className="flex items-center justify-center gap-4 mb-16">
            <a href="https://e2b.dev/startups" target="_blank" rel="noopener noreferrer" className="opacity-60 hover:opacity-100 transition-opacity">
              <img src="/e2b-badge.svg" alt="Sponsored by E2B for Startups" className="h-8 w-auto rounded" />
            </a>
            <a href="https://peerpush.net/p/pipilot" target="_blank" rel="noopener" className="opacity-60 hover:opacity-100 transition-opacity">
              <img src="https://peerpush.net/p/pipilot/badge.png" alt="PiPilot badge" className="h-8 w-auto" style={{ width: '230px' }} />
            </a>
          </div>

          {/* Refund Policy */}
          <div className="mb-16 max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-white mb-6 text-center">Refund Policy</h2>
            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Shield className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-medium text-white text-sm mb-1">Non-Refundable After Use</h3>
                  <p className="text-gray-400 text-sm">All subscriptions are non-refundable once credits have been used. Credits are consumed immediately upon AI interactions.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Check className="w-4 h-4 text-green-400" />
                </div>
                <div>
                  <h3 className="font-medium text-white text-sm mb-1">24-Hour Satisfaction Window</h3>
                  <p className="text-gray-400 text-sm">If you haven't used any credits, contact <a href="mailto:support@pipilot.dev" className="text-orange-400 hover:underline">support@pipilot.dev</a> within 24 hours for a full refund.</p>
                </div>
              </div>

              <div className="border-t border-gray-800 pt-4 flex items-center justify-between">
                <p className="text-gray-500 text-xs">
                  Questions? <a href="mailto:support@pipilot.dev" className="text-orange-400 hover:underline">support@pipilot.dev</a>
                </p>
                <a
                  href="/refund-policy"
                  className="text-orange-400 hover:text-orange-300 text-xs font-medium transition-colors"
                >
                  Full Policy
                </a>
              </div>
            </div>
          </div>

          {/* FAQ */}
          <div className="mb-16 max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-white mb-6 text-center">Frequently Asked Questions</h2>
            <div className="space-y-2">
              {faqData.map((faq, index) => (
                <div key={index} className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
                  <button
                    className="flex items-center justify-between w-full cursor-pointer p-4 hover:bg-gray-800/50 transition-colors text-left"
                    onClick={() => setOpenFAQ(openFAQ === index ? null : index)}
                  >
                    <span className="text-sm font-medium text-white pr-4">{faq.question}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-gray-500 transition-transform duration-200 flex-shrink-0 ${
                        openFAQ === index ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {openFAQ === index && (
                    <div className="px-4 pb-4">
                      <p className="text-sm text-gray-400 leading-relaxed">{faq.answer}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

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
