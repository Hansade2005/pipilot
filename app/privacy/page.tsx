"use client"

import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Logo } from "@/components/ui/logo"
import { Heart } from "lucide-react"
import { usePageTitle } from '@/hooks/use-page-title'

export default function PrivacyPage() {
  usePageTitle('Privacy Policy')
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
              Privacy Policy
            </h1>
            <p className="text-lg text-white/80">
              Last updated: January 2025
            </p>
          </div>

          {/* Privacy Content */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-8 space-y-8">
            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">1. Introduction</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                Welcome to PiPilot, Inc. ("we," "our," or "us"). We are committed to protecting your privacy and ensuring the security of your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our AI-powered web application development platform.
              </p>
              <p className="text-gray-300 leading-relaxed">
                By using our Service, you agree to the collection and use of information in accordance with this policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">2. Information We Collect</h2>
              <h3 className="text-xl font-medium text-white mb-3">2.1 Personal Information</h3>
              <p className="text-gray-300 leading-relaxed mb-4">
                We may collect personally identifiable information that you provide directly to us, including:
              </p>
              <ul className="list-disc list-inside text-gray-300 leading-relaxed space-y-2 ml-4 mb-4">
                <li>Name and contact information (email address)</li>
                <li>Account credentials and profile information</li>
                <li>Payment information (processed securely through our payment processors)</li>
                <li>Communication preferences and support requests</li>
              </ul>

              <h3 className="text-xl font-medium text-white mb-3">2.2 Usage Data</h3>
              <p className="text-gray-300 leading-relaxed mb-4">
                We automatically collect certain information when you use our Service:
              </p>
              <ul className="list-disc list-inside text-gray-300 leading-relaxed space-y-2 ml-4">
                <li>IP address and location information</li>
                <li>Browser type and version</li>
                <li>Pages visited and time spent on our Service</li>
                <li>Device information and operating system</li>
                <li>Referral sources and navigation patterns</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">3. How We Use Your Information</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                We use the collected information for various purposes:
              </p>
              <ul className="list-disc list-inside text-gray-300 leading-relaxed space-y-2 ml-4">
                <li>To provide and maintain our Service</li>
                <li>To process transactions and manage subscriptions</li>
                <li>To communicate with you about your account and our services</li>
                <li>To provide customer support and respond to your inquiries</li>
                <li>To improve our Service through analytics and user feedback</li>
                <li>To send you marketing communications (with your consent)</li>
                <li>To comply with legal obligations</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">4. Information Sharing and Disclosure</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                We do not sell, trade, or otherwise transfer your personal information to third parties, except in the following circumstances:
              </p>
              <ul className="list-disc list-inside text-gray-300 leading-relaxed space-y-2 ml-4">
                <li><strong>Service Providers:</strong> We may share information with trusted third-party service providers who assist us in operating our Service</li>
                <li><strong>Legal Requirements:</strong> We may disclose information if required by law or to protect our rights and safety</li>
                <li><strong>Business Transfers:</strong> In the event of a merger, acquisition, or sale of assets, your information may be transferred</li>
                <li><strong>With Your Consent:</strong> We may share information with your explicit consent</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">5. Data Security</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                We implement appropriate technical and organizational security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. These measures include:
              </p>
              <ul className="list-disc list-inside text-gray-300 leading-relaxed space-y-2 ml-4">
                <li>Encryption of data in transit and at rest</li>
                <li>Regular security audits and updates</li>
                <li>Access controls and authentication procedures</li>
                <li>Secure payment processing through certified providers</li>
              </ul>
              <p className="text-gray-300 leading-relaxed">
                However, no method of transmission over the internet or electronic storage is 100% secure. While we strive to protect your information, we cannot guarantee absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">6. Data Retention</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                We retain your personal information only as long as necessary for the purposes outlined in this Privacy Policy, unless a longer retention period is required by law. When we no longer need your information, we will securely delete or anonymize it.
              </p>
              <p className="text-gray-300 leading-relaxed">
                Account data is retained while your account is active and for a reasonable period after account closure for legal and regulatory purposes.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">7. Your Rights and Choices</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                Depending on your location, you may have the following rights regarding your personal information:
              </p>
              <ul className="list-disc list-inside text-gray-300 leading-relaxed space-y-2 ml-4">
                <li><strong>Access:</strong> Request a copy of the personal information we hold about you</li>
                <li><strong>Correction:</strong> Request correction of inaccurate or incomplete information</li>
                <li><strong>Deletion:</strong> Request deletion of your personal information</li>
                <li><strong>Portability:</strong> Request transfer of your data in a structured format</li>
                <li><strong>Opt-out:</strong> Opt out of marketing communications or data processing</li>
              </ul>
              <p className="text-gray-300 leading-relaxed">
                To exercise these rights, please contact us at privacy@pipilot.dev.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">8. Cookies and Tracking Technologies</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                We use cookies and similar tracking technologies to enhance your experience on our Service. You can control cookie settings through your browser preferences, though disabling cookies may affect Service functionality.
              </p>
              <p className="text-gray-300 leading-relaxed">
                We use cookies for authentication, security, analytics, and to remember your preferences.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">9. Third-Party Services</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                Our Service may contain links to third-party websites or integrate with third-party services. We are not responsible for the privacy practices of these external parties. We encourage you to review their privacy policies before providing any personal information.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">10. Children's Privacy</h2>
              <p className="text-gray-300 leading-relaxed">
                Our Service is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13. If we become aware that we have collected personal information from a child under 13, we will take steps to delete such information.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">11. International Data Transfers</h2>
              <p className="text-gray-300 leading-relaxed">
                Your information may be transferred to and processed in countries other than your own. We ensure that such transfers comply with applicable data protection laws and implement appropriate safeguards to protect your information.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">12. Changes to This Privacy Policy</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date.
              </p>
              <p className="text-gray-300 leading-relaxed">
                We recommend reviewing this Privacy Policy periodically for any changes.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">13. Contact Us</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                If you have any questions about this Privacy Policy or our data practices, please contact us:
              </p>
              <div className="text-gray-300 leading-relaxed ml-4">
                <p><strong>Email:</strong> privacy@pipilot.dev</p>
                <p><strong>Subject:</strong> Privacy Policy Inquiry</p>
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
