"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, AlertCircle } from "lucide-react"
import { STRIPE_API_PLANS } from "@/config/stripe-api-plans"

function CheckoutContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const plan = searchParams.get('plan') || 'starter'

  useEffect(() => {
    initiateCheckout()
  }, [])

  const initiateCheckout = async () => {
    try {
      // Check if user is logged in
      const { data: { user }, error: authError } = await supabase.auth.getUser()

      if (authError || !user) {
        // Redirect to login with return URL
        router.push(`/auth/signup?redirect=/api/checkout?plan=${plan}`)
        return
      }

      const planConfig = STRIPE_API_PLANS[plan as keyof typeof STRIPE_API_PLANS]

      if (!planConfig || !planConfig.priceId) {
        setError('Invalid plan selected')
        setLoading(false)
        return
      }

      // Create Stripe checkout session
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId: planConfig.priceId,
          tier: plan,
          userId: user.id,
          userEmail: user.email
        }),
      })

      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      if (data.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url
      } else {
        throw new Error('No checkout URL returned')
      }

    } catch (err: any) {
      console.error('Checkout error:', err)
      setError(err.message || 'Failed to initiate checkout')
      setLoading(false)
    }
  }

  return (
    <Card className="bg-gray-800 border-gray-700 p-8 max-w-md w-full text-center">
      {loading ? (
        <>
          <Loader2 className="w-12 h-12 text-orange-400 animate-spin mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">
            Redirecting to Checkout...
          </h2>
          <p className="text-gray-400">
            Please wait while we set up your subscription.
          </p>
        </>
      ) : error ? (
        <>
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">
            Checkout Error
          </h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <div className="space-y-3">
            <Button
              className="w-full bg-orange-500 hover:bg-orange-600"
              onClick={() => router.push('/api')}
            >
              Back to Pricing
            </Button>
            <Button
              variant="outline"
              className="w-full border-gray-600 text-white hover:bg-gray-700"
              onClick={() => initiateCheckout()}
            >
              Try Again
            </Button>
          </div>
        </>
      ) : null}
    </Card>
  )
}

export default function CheckoutPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <Suspense
        fallback={
          <Card className="bg-gray-800 border-gray-700 p-8 max-w-md w-full text-center">
            <Loader2 className="w-12 h-12 text-orange-400 animate-spin mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Loading...</h2>
          </Card>
        }
      >
        <CheckoutContent />
      </Suspense>
    </div>
  )
}
