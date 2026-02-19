import { Logo } from "@/components/ui/logo"
import Link from "next/link"
import { toast } from "sonner"

export function Footer() {
  return (
    <footer className="relative z-10 bg-gray-900/50 backdrop-blur-sm border-t border-gray-800">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12 pb-0">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2 md:col-span-1">
            <Logo variant="text" size="md" className="mb-4" />
            <p className="text-gray-400 text-sm">
              Build something amazing with AI-powered development.
            </p>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-4">Product</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/pricing" className="text-gray-400 hover:text-orange-400 transition-colors">Plans</Link></li>
              <li><Link href="/enterprise" className="text-gray-400 hover:text-orange-400 transition-colors">Business</Link></li>
              <li><Link href="/showcase" className="text-gray-400 hover:text-orange-400 transition-colors">Showcase</Link></li>
              <li><Link href="/features/integrations" className="text-gray-400 hover:text-orange-400 transition-colors">Integrations</Link></li>
              {/* <li><Link href="#" className="text-gray-400 hover:text-white transition-colors cursor-pointer" onClick={(e) => { e.preventDefault(); toast.info("Coming soon!") }}>Student discount</Link></li> */}
              {/* <li><Link href="#" className="text-gray-400 hover:text-white transition-colors cursor-pointer" onClick={(e) => { e.preventDefault(); toast.info("Coming soon!") }}>Solutions</Link></li> */}
              {/* <li><Link href="#" className="text-gray-400 hover:text-white transition-colors cursor-pointer" onClick={(e) => { e.preventDefault(); toast.info("Coming soon!") }}>Changelog</Link></li> */}
            </ul>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-4">Resources</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/about" className="text-gray-400 hover:text-orange-400 transition-colors">About Us</Link></li>
              <li><Link href="/docs" className="text-gray-400 hover:text-orange-400 transition-colors">Docs</Link></li>
              <li><Link href="/blog" className="text-gray-400 hover:text-orange-400 transition-colors">Blog</Link></li>
              <li><Link href="/learn" className="text-gray-400 hover:text-orange-400 transition-colors">Learn</Link></li>
              <li><Link href="/privacy" className="text-gray-400 hover:text-orange-400 transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms" className="text-gray-400 hover:text-orange-400 transition-colors">Terms & Conditions</Link></li>
              <li><Link href="/refund-policy" className="text-gray-400 hover:text-orange-400 transition-colors">Refund Policy</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-4">Community</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/community" className="text-gray-400 hover:text-orange-400 transition-colors">Community</Link></li>
              <li><Link href="/support" className="text-gray-400 hover:text-orange-400 transition-colors">Support</Link></li>
              {/* <li><Link href="#" className="text-gray-400 hover:text-white transition-colors cursor-pointer" onClick={(e) => { e.preventDefault(); toast.info("Coming soon!") }}>Discord</Link></li> */}
              {/* <li><Link href="#" className="text-gray-400 hover:text-white transition-colors cursor-pointer" onClick={(e) => { e.preventDefault(); toast.info("Coming soon!") }}>Reddit</Link></li> */}
              {/* <li><Link href="#" className="text-gray-400 hover:text-white transition-colors cursor-pointer" onClick={(e) => { e.preventDefault(); toast.info("Coming soon!") }}>X/Twitter</Link></li> */}
              {/* <li><Link href="#" className="text-gray-400 hover:text-white transition-colors cursor-pointer" onClick={(e) => { e.preventDefault(); toast.info("Coming soon!") }}>LinkedIn</Link></li> */}
            </ul>
          </div>
        </div>

        {/* Badge marquee - full width, own row */}
        <div className="border-t border-gray-800 mt-8 py-6 overflow-hidden">
          <div className="flex items-center animate-marquee whitespace-nowrap">
            <a href="https://e2b.dev/startups" target="_blank" rel="noopener noreferrer" className="shrink-0 mx-4 md:mx-6">
              <img src="/e2b-badge.svg" alt="Sponsored by E2B for Startups" className="h-10 md:h-12 w-auto rounded" />
            </a>
            <a href="https://www.producthunt.com/products/pipilot?embed=true&utm_source=badge-featured&utm_medium=badge&utm_source=badge-pipilot" target="_blank" rel="noopener noreferrer" className="shrink-0 mx-4 md:mx-6">
              <img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1040549&theme=light&t=1763663329258" alt="PiPilot on Product Hunt" className="h-10 md:h-12 w-auto" />
            </a>
            <a href="https://dang.ai/" target="_blank" className="shrink-0 mx-4 md:mx-6">
              <img src="https://cdn.prod.website-files.com/63d8afd87da01fb58ea3fbcb/6487e2868c6c8f93b4828827_dang-badge.png" alt="Dang.ai" className="h-10 md:h-12 w-auto rounded" />
            </a>
            <a target="_blank" href="https://softwarebolt.com" className="shrink-0 mx-4 md:mx-6">
              <img src="https://softwarebolt.com/assets/images/badge.png" alt="Software Bolt" className="h-10 md:h-12 w-auto rounded" />
            </a>
            {/* Duplicate set for seamless loop */}
            <a href="https://e2b.dev/startups" target="_blank" rel="noopener noreferrer" className="shrink-0 mx-4 md:mx-6">
              <img src="/e2b-badge.svg" alt="Sponsored by E2B for Startups" className="h-10 md:h-12 w-auto rounded" />
            </a>
            <a href="https://www.producthunt.com/products/pipilot?embed=true&utm_source=badge-featured&utm_medium=badge&utm_source=badge-pipilot" target="_blank" rel="noopener noreferrer" className="shrink-0 mx-4 md:mx-6">
              <img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1040549&theme=light&t=1763663329258" alt="PiPilot on Product Hunt" className="h-10 md:h-12 w-auto" />
            </a>
            <a href="https://dang.ai/" target="_blank" className="shrink-0 mx-4 md:mx-6">
              <img src="https://cdn.prod.website-files.com/63d8afd87da01fb58ea3fbcb/6487e2868c6c8f93b4828827_dang-badge.png" alt="Dang.ai" className="h-10 md:h-12 w-auto rounded" />
            </a>
            <a target="_blank" href="https://softwarebolt.com" className="shrink-0 mx-4 md:mx-6">
              <img src="https://softwarebolt.com/assets/images/badge.png" alt="Software Bolt" className="h-10 md:h-12 w-auto rounded" />
            </a>
          </div>
        </div>

        {/* Copyright row */}
        <div className="border-t border-gray-800 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Logo variant="icon" size="sm" />
              <span className="text-gray-500 text-xs">EN</span>
            </div>
            <div className="text-gray-500 text-xs">
              © 2025 PiPilot. All rights reserved.
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
