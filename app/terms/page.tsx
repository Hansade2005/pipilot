"use client"

import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Logo } from "@/components/ui/logo"
import { Heart } from "lucide-react"
import { usePageTitle } from '@/hooks/use-page-title'

export default function TermsPage() {
  usePageTitle('Terms of Service')
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
              Terms & Conditions
            </h1>
            <p className="text-lg text-white/80">
              Last updated: January 2025
            </p>
          </div>

          {/* Terms Content */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-8 space-y-8">
            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">1. Agreement to Terms</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                By accessing and using PiPilot ("the Service"), you agree to be bound by these Terms & Conditions ("Terms"). If you disagree with any part of these terms, then you may not access the Service.
              </p>
              <p className="text-gray-300 leading-relaxed">
                These Terms apply to all visitors, users, and others who access or use the Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">2. Description of Service</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                PiPilot is an AI-powered web application development platform that allows users to create, modify, and deploy web applications through natural language interactions. The Service provides AI-generated code, project management tools, and deployment capabilities.
              </p>
              <p className="text-gray-300 leading-relaxed">
                Our Service is operated by PiPilot, Inc. (the "Company", "we", "us", or "our").
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">3. User Accounts</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                When you create an account with us, you must provide information that is accurate, complete, and current at all times. Failure to do so constitutes a breach of the Terms, which may result in immediate termination of your account on our Service.
              </p>
              <p className="text-gray-300 leading-relaxed">
                You are responsible for safeguarding the password and for all activities that occur under your account.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">4. Subscription and Billing</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                Some parts of the Service are billed on a subscription basis ("Subscription(s)"). You will be billed in advance on a recurring and periodic basis ("Billing Cycle"). Billing cycles are set on a monthly or annual basis, depending on the type of subscription plan you select.
              </p>
              <p className="text-gray-300 leading-relaxed mb-4">
                At the end of each Billing Cycle, your Subscription will automatically renew under the exact same conditions unless you cancel it or PiPilot cancels it.
              </p>
              <p className="text-gray-300 leading-relaxed">
                You may cancel your Subscription either through your online account management page or by contacting our customer support team.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">5. Fee Changes</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                PiPilot, in its sole discretion and at any time, may modify the Subscription fees. Any fee change will become effective at the end of the then-current Billing Cycle.
              </p>
              <p className="text-gray-300 leading-relaxed">
                We will provide you with reasonable prior notice of any change in Subscription fees to give you an opportunity to terminate your Subscription before such change becomes effective.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">6. Refunds</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                <strong className="text-white">All subscriptions are non-refundable once credits have been used.</strong> Credits are consumed immediately upon AI interactions within the platform.
              </p>
              <p className="text-gray-300 leading-relaxed mb-4">
                <strong className="text-white">24-Hour Satisfaction Window:</strong> If you are unsatisfied with our service and have not used any credits, you may request a full refund within 24 hours of your initial purchase by contacting support@pipilot.dev.
              </p>
              <p className="text-gray-300 leading-relaxed">
                Approved refunds will be processed to your original payment method within 5-10 business days.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">7. Chargeback Policy</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                <strong className="text-white">IMPORTANT: Chargebacks on legitimate transactions will result in permanent account termination.</strong>
              </p>
              <p className="text-gray-300 leading-relaxed mb-4">
                We strongly encourage you to contact our support team at support@pipilot.dev before initiating any chargeback or dispute with your bank or credit card company. We are committed to resolving issues fairly and promptly.
              </p>
              <p className="text-gray-300 leading-relaxed mb-4">
                <strong className="text-white">Consequences of Unauthorized Chargebacks:</strong>
              </p>
              <ul className="list-disc list-inside text-gray-300 leading-relaxed space-y-2 ml-4 mb-4">
                <li><strong>Immediate Account Termination:</strong> Filing a chargeback on a legitimate transaction (where you received and used the service) will result in immediate and permanent termination of your PiPilot account.</li>
                <li><strong>Forfeiture of Credits:</strong> All unused credits, subscription time, and any projects stored on our platform will be forfeited.</li>
                <li><strong>Ban from Future Services:</strong> Users who file illegitimate chargebacks may be permanently banned from creating new accounts or using PiPilot services.</li>
                <li><strong>Dispute and Collection:</strong> PiPilot reserves the right to dispute chargebacks and pursue collection through appropriate legal channels for fraudulent claims.</li>
                <li><strong>Fraud Reporting:</strong> Fraudulent chargebacks may be reported to fraud prevention databases and payment processors.</li>
              </ul>
              <p className="text-gray-300 leading-relaxed mb-4">
                <strong className="text-white">Before Filing a Chargeback:</strong>
              </p>
              <ul className="list-disc list-inside text-gray-300 leading-relaxed space-y-2 ml-4 mb-4">
                <li>Contact support@pipilot.dev with your account email and a description of the issue</li>
                <li>Allow up to 24 hours for an initial response</li>
                <li>Work with our team to resolve billing disputes or technical issues</li>
                <li>Request a refund if eligible under our 24-hour satisfaction window</li>
              </ul>
              <p className="text-gray-300 leading-relaxed">
                <strong className="text-white">Unauthorized Transactions:</strong> If you believe your payment information was used without your authorization (e.g., identity theft, compromised card), please contact us immediately at support@pipilot.dev AND your bank. We will work with you to investigate and resolve the issue appropriately.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">8. Content Ownership</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                You retain all rights to the content and projects you create using PiPilot. All code, designs, and other materials generated through the Service belong to you.
              </p>
              <p className="text-gray-300 leading-relaxed">
                By using the Service, you grant PiPilot a limited license to store, process, and display your content solely for the purpose of providing the Service to you.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">9. Acceptable Use</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                You agree not to use the Service:
              </p>
              <ul className="list-disc list-inside text-gray-300 leading-relaxed space-y-2 ml-4">
                <li>For any unlawful purpose or to solicit others to perform unlawful acts</li>
                <li>To violate any international, federal, provincial, or state regulations, rules, laws, or local ordinances</li>
                <li>To infringe upon or violate our intellectual property rights or the intellectual property rights of others</li>
                <li>To harass, abuse, insult, harm, defame, slander, disparage, intimidate, or discriminate</li>
                <li>To submit false or misleading information</li>
                <li>To upload or transmit viruses or any other type of malicious code</li>
                <li>To spam, phish, pharm, pretext, spider, crawl, or scrape</li>
                <li>For any obscene or immoral purpose</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">10. Termination</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                We may terminate or suspend your account immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.
              </p>
              <p className="text-gray-300 leading-relaxed">
                Upon termination, your right to use the Service will cease immediately. If you wish to terminate your account, you may simply discontinue using the Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">11. Disclaimer</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                The information on this website is provided on an "as is" basis. To the fullest extent permitted by law, PiPilot:
              </p>
              <ul className="list-disc list-inside text-gray-300 leading-relaxed space-y-2 ml-4">
                <li>Excludes all representations and warranties relating to this website and its contents</li>
                <li>Does not guarantee that the website will be constantly available, or available at all</li>
                <li>Does not guarantee that the information on this website is complete, true, accurate, or non-misleading</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">12. Limitation of Liability</h2>
              <p className="text-gray-300 leading-relaxed">
                In no event shall PiPilot, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your use of the Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">13. Governing Law</h2>
              <p className="text-gray-300 leading-relaxed">
                These Terms shall be interpreted and governed by the laws of the jurisdiction in which PiPilot operates, without regard to its conflict of law provisions.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">14. Changes to Terms</h2>
              <p className="text-gray-300 leading-relaxed">
                We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision is material, we will try to provide at least 30 days notice prior to any new terms taking effect.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">15. Contact Information</h2>
              <p className="text-gray-300 leading-relaxed">
                If you have any questions about these Terms & Conditions, please contact us at support@pipilot.dev or through our support channels.
              </p>
            </section>
          </div>
        </div>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  )
}
