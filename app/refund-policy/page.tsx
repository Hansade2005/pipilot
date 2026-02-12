"use client"

import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Logo } from "@/components/ui/logo"
import { Heart } from "lucide-react"
import { usePageTitle } from '@/hooks/use-page-title'

export default function RefundPolicyPage() {
  usePageTitle('Refund Policy')
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Enhanced Gradient Background */}
      <div className="absolute inset-0 lovable-gradient" />

      {/* Noise Texture Overlay */}
      <div className="absolute inset-0 noise-texture" />

      {/* Navigation */}
      <Navigation />

      {/* Main Content */}
      <main className="relative z-10 pt-16 pb-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="flex items-center justify-center mb-4">
              <div className="w-6 h-6 rounded-full heart-gradient flex items-center justify-center">
                <Heart className="w-3 h-3 text-white fill-current" />
              </div>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Refund Policy
            </h1>
            <p className="text-lg text-white/80">
              Last updated: January 2025
            </p>
          </div>

          {/* Important Notice */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 mb-8">
            <p className="text-amber-400 font-semibold text-center">
              All subscriptions are non-refundable once credits have been used.
            </p>
          </div>

          {/* Refund Policy Content */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-8 space-y-8">
            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">1. Overview</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                At PiPilot (operated by Pixelways Solutions Inc.), we strive to provide excellent service. This Refund Policy outlines the specific circumstances under which refunds may be granted.
              </p>
              <p className="text-gray-300 leading-relaxed">
                <strong className="text-white">Please read this policy carefully before subscribing.</strong> By purchasing a subscription, you acknowledge and agree to these terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">2. Non-Refundable After Credit Usage</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                <strong className="text-white">All subscriptions become non-refundable once any credits have been used.</strong>
              </p>
              <p className="text-gray-300 leading-relaxed mb-4">
                Credits are consumed immediately when you:
              </p>
              <ul className="list-disc list-inside text-gray-300 leading-relaxed space-y-2 ml-4">
                <li>Send messages to the AI assistant</li>
                <li>Generate code or make changes to projects</li>
                <li>Use any AI-powered features within the platform</li>
              </ul>
              <p className="text-gray-300 leading-relaxed">
                Once credits are consumed, the service has been rendered and refunds cannot be provided.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">3. 24-Hour Satisfaction Window</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                If you are unsatisfied with PiPilot and meet <strong className="text-white">ALL</strong> of the following conditions, you may request a full refund:
              </p>
              <ul className="list-disc list-inside text-gray-300 leading-relaxed space-y-2 ml-4 mb-4">
                <li><strong>No credits used:</strong> You have not used any of your subscription credits</li>
                <li><strong>Within 24 hours:</strong> Your request is made within 24 hours of your initial purchase</li>
                <li><strong>First-time subscriber:</strong> This is your first paid subscription with PiPilot</li>
              </ul>
              <p className="text-gray-300 leading-relaxed">
                To request a refund within this window, email <strong className="text-purple-400">support@pipilot.dev</strong> with your account email and reason for the refund.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">4. Non-Refundable Items</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                The following are <strong className="text-white">NOT eligible for refunds under any circumstances:</strong>
              </p>
              <ul className="list-disc list-inside text-gray-300 leading-relaxed space-y-2 ml-4">
                <li>Subscriptions where any credits have been used</li>
                <li>Refund requests made after the 24-hour window</li>
                <li>Additional credit purchases (top-ups)</li>
                <li>Subscription renewals (monthly or annual)</li>
                <li>Accounts terminated for Terms of Service violations</li>
                <li>Accounts involved in chargeback disputes</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">5. Billing Errors</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                If you believe you were charged incorrectly (duplicate charges, wrong amount, etc.), please contact us immediately at <strong className="text-purple-400">support@pipilot.dev</strong>.
              </p>
              <p className="text-gray-300 leading-relaxed">
                We will investigate all billing error claims and correct any verified mistakes promptly.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">6. Subscription Cancellation</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                You may cancel your subscription at any time. When you cancel:
              </p>
              <ul className="list-disc list-inside text-gray-300 leading-relaxed space-y-2 ml-4">
                <li>You retain access to your subscription benefits until the end of your current billing period</li>
                <li>No refunds are provided for unused time or credits</li>
                <li>Your account reverts to the free plan after the billing period ends</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4 text-red-400">7. Chargeback Policy</h2>
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4">
                <p className="text-red-400 font-semibold">
                  IMPORTANT: Chargebacks on legitimate transactions will result in permanent account termination.
                </p>
              </div>
              <p className="text-gray-300 leading-relaxed mb-4">
                Before initiating a chargeback, you <strong className="text-white">MUST</strong> contact us at support@pipilot.dev. We are committed to resolving any issues fairly.
              </p>
              <p className="text-gray-300 leading-relaxed mb-4">
                <strong className="text-white">Consequences of filing a chargeback on a legitimate transaction:</strong>
              </p>
              <ul className="list-disc list-inside text-gray-300 leading-relaxed space-y-2 ml-4 mb-4">
                <li><strong>Immediate and permanent account termination</strong></li>
                <li>Forfeiture of all unused credits and subscription time</li>
                <li>Loss of all projects and data stored on our platform</li>
                <li>Permanent ban from creating new accounts</li>
                <li>We will dispute the chargeback with evidence of service delivery</li>
                <li>Potential reporting to fraud prevention databases</li>
                <li>Potential collection action through legal channels</li>
              </ul>
              <p className="text-gray-300 leading-relaxed">
                <strong className="text-white">Unauthorized transactions:</strong> If your payment method was used without your authorization (e.g., stolen card, identity theft), please contact both us AND your bank immediately. We will work with you to investigate.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">8. How to Request a Refund</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                If you believe you qualify for a refund under this policy:
              </p>
              <ol className="list-decimal list-inside text-gray-300 leading-relaxed space-y-2 ml-4 mb-4">
                <li>Email <strong className="text-purple-400">support@pipilot.dev</strong></li>
                <li>Include your account email address</li>
                <li>Provide your reason for requesting a refund</li>
                <li>Include your purchase date and amount</li>
              </ol>
              <p className="text-gray-300 leading-relaxed">
                We will respond within 24 hours. Approved refunds are processed within 5-10 business days to your original payment method.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">9. Changes to This Policy</h2>
              <p className="text-gray-300 leading-relaxed">
                PiPilot reserves the right to modify this Refund Policy at any time. Changes are effective immediately upon posting. Continued use of the service after changes constitutes acceptance of the updated policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">10. Contact Information</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                For refund inquiries or billing issues:
              </p>
              <div className="text-gray-300 leading-relaxed ml-4">
                <p><strong>Email:</strong> support@pipilot.dev</p>
                <p><strong>Response Time:</strong> Within 24 hours</p>
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  )
}
