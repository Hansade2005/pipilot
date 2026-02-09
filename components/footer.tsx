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
              <li><Link href="/pricing" className="text-gray-400 hover:text-white transition-colors">Plans</Link></li>
              <li><Link href="/enterprise" className="text-gray-400 hover:text-white transition-colors">Business</Link></li>
              <li><Link href="/showcase" className="text-gray-400 hover:text-white transition-colors">Showcase</Link></li>
              <li><Link href="/features/integrations" className="text-gray-400 hover:text-white transition-colors">Integrations</Link></li>
              {/* <li><Link href="#" className="text-gray-400 hover:text-white transition-colors cursor-pointer" onClick={(e) => { e.preventDefault(); toast.info("Coming soon!") }}>Student discount</Link></li> */}
              {/* <li><Link href="#" className="text-gray-400 hover:text-white transition-colors cursor-pointer" onClick={(e) => { e.preventDefault(); toast.info("Coming soon!") }}>Solutions</Link></li> */}
              {/* <li><Link href="#" className="text-gray-400 hover:text-white transition-colors cursor-pointer" onClick={(e) => { e.preventDefault(); toast.info("Coming soon!") }}>Changelog</Link></li> */}
            </ul>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-4">Resources</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/about" className="text-gray-400 hover:text-white transition-colors">About Us</Link></li>
              <li><Link href="/docs" className="text-gray-400 hover:text-white transition-colors">Docs</Link></li>
              <li><Link href="/blog" className="text-gray-400 hover:text-white transition-colors">Blog</Link></li>
              <li><Link href="/learn" className="text-gray-400 hover:text-white transition-colors">Learn</Link></li>
              <li><Link href="/privacy" className="text-gray-400 hover:text-white transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms" className="text-gray-400 hover:text-white transition-colors">Terms & Conditions</Link></li>
              <li><Link href="/refund-policy" className="text-gray-400 hover:text-white transition-colors">Refund Policy</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-4">Community</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/community" className="text-gray-400 hover:text-white transition-colors">Community</Link></li>
              <li><Link href="/support" className="text-gray-400 hover:text-white transition-colors">Support</Link></li>
              {/* <li><Link href="#" className="text-gray-400 hover:text-white transition-colors cursor-pointer" onClick={(e) => { e.preventDefault(); toast.info("Coming soon!") }}>Discord</Link></li> */}
              {/* <li><Link href="#" className="text-gray-400 hover:text-white transition-colors cursor-pointer" onClick={(e) => { e.preventDefault(); toast.info("Coming soon!") }}>Reddit</Link></li> */}
              {/* <li><Link href="#" className="text-gray-400 hover:text-white transition-colors cursor-pointer" onClick={(e) => { e.preventDefault(); toast.info("Coming soon!") }}>X/Twitter</Link></li> */}
              {/* <li><Link href="#" className="text-gray-400 hover:text-white transition-colors cursor-pointer" onClick={(e) => { e.preventDefault(); toast.info("Coming soon!") }}>LinkedIn</Link></li> */}
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-8 pt-8 pb-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center space-x-4">
              <Logo variant="icon" size="sm" />
              <span className="text-gray-400 text-sm">EN</span>
            </div>
            
            <div className="flex items-center overflow-hidden">
              {/* Mobile: Single badge marquee */}
              <div className="flex items-center animate-marquee-mobile md:hidden whitespace-nowrap">
                <a href="https://e2b.dev/startups" target="_blank" rel="noopener noreferrer" className="mr-4">
                  <img src="/Black-2.png" alt="Sponsored by E2B for Startups" style={{width: '120px', height: '43px'}} width="120" height="43" />
                </a>
                <a href="https://www.producthunt.com/products/pipilot?embed=true&utm_source=badge-featured&utm_medium=badge&utm_source=badge-pipilot" target="_blank" rel="noopener noreferrer" className="mr-4">
                  <img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1040549&theme=light&t=1763663329258" alt="PiPilot - Build full apps and websites just by chatting with AI. | Product Hunt" style={{width: '200px', height: '43px'}} width="200" height="43" />
                </a>
                <a href="https://dang.ai/" target="_blank" className="mr-4">
                  <img src="https://cdn.prod.website-files.com/63d8afd87da01fb58ea3fbcb/6487e2868c6c8f93b4828827_dang-badge.png" alt="Dang.ai" style={{width: '120px', height: '43px'}} width="120" height="43" />
                </a>
                <a target="_blank" href="https://softwarebolt.com" className="mr-4">
                  <img src="https://softwarebolt.com/assets/images/badge.png" alt="Software Bolt" style={{width: '120px', height: '43px'}} width="120" height="43" />
                </a>
                {/* Duplicate for seamless loop */}
                <a href="https://e2b.dev/startups" target="_blank" rel="noopener noreferrer" className="mr-4">
                  <img src="/Black-2.png" alt="Sponsored by E2B for Startups" style={{width: '120px', height: '43px'}} width="120" height="43" />
                </a>
                <a href="https://www.producthunt.com/products/pipilot?embed=true&utm_source=badge-featured&utm_medium=badge&utm_source=badge-pipilot" target="_blank" rel="noopener noreferrer" className="mr-4">
                  <img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1040549&theme=light&t=1763663329258" alt="PiPilot - Build full apps and websites just by chatting with AI. | Product Hunt" style={{width: '200px', height: '43px'}} width="200" height="43" />
                </a>
                <a href="https://dang.ai/" target="_blank" className="mr-4">
                  <img src="https://cdn.prod.website-files.com/63d8afd87da01fb58ea3fbcb/6487e2868c6c8f93b4828827_dang-badge.png" alt="Dang.ai" style={{width: '120px', height: '43px'}} width="120" height="43" />
                </a>
                <a target="_blank" href="https://softwarebolt.com" className="mr-4">
                  <img src="https://softwarebolt.com/assets/images/badge.png" alt="Software Bolt" style={{width: '120px', height: '43px'}} width="120" height="43" />
                </a>
              </div>

              {/* Desktop: Multiple badges marquee */}
              <div className="hidden md:flex items-center animate-marquee whitespace-nowrap">
                <a href="https://e2b.dev/startups" target="_blank" rel="noopener noreferrer" className="mr-8">
                  <img src="/Black-2.png" alt="Sponsored by E2B for Startups" style={{width: '150px', height: '54px'}} width="150" height="54" />
                </a>
                <a href="https://www.producthunt.com/products/pipilot?embed=true&utm_source=badge-featured&utm_medium=badge&utm_source=badge-pipilot" target="_blank" rel="noopener noreferrer" className="mr-8">
                  <img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1040549&theme=light&t=1763663329258" alt="PiPilot - Build full apps and websites just by chatting with AI. | Product Hunt" style={{width: '250px', height: '54px'}} width="250" height="54" />
                </a>
                <a href="https://dang.ai/" target="_blank" className="mr-8">
                  <img src="https://cdn.prod.website-files.com/63d8afd87da01fb58ea3fbcb/6487e2868c6c8f93b4828827_dang-badge.png" alt="Dang.ai" style={{width: '150px', height: '54px'}} width="150" height="54" />
                </a>
                <a target="_blank" href="https://softwarebolt.com" className="mr-8">
                  <img src="https://softwarebolt.com/assets/images/badge.png" alt="Software Bolt" height="54" />
                </a>
                {/* Duplicate for seamless loop */}
                <a href="https://e2b.dev/startups" target="_blank" rel="noopener noreferrer" className="mr-8">
                  <img src="/Black-2.png" alt="Sponsored by E2B for Startups" style={{width: '150px', height: '54px'}} width="150" height="54" />
                </a>
                <a href="https://www.producthunt.com/products/pipilot?embed=true&utm_source=badge-featured&utm_medium=badge&utm_source=badge-pipilot" target="_blank" rel="noopener noreferrer" className="mr-8">
                  <img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1040549&theme=light&t=1763663329258" alt="PiPilot - Build full apps and websites just by chatting with AI. | Product Hunt" style={{width: '250px', height: '54px'}} width="250" height="54" />
                </a>
                <a href="https://dang.ai/" target="_blank" className="mr-8">
                  <img src="https://cdn.prod.website-files.com/63d8afd87da01fb58ea3fbcb/6487e2868c6c8f93b4828827_dang-badge.png" alt="Dang.ai" style={{width: '150px', height: '54px'}} width="150" height="54" />
                </a>
                <a target="_blank" href="https://softwarebolt.com" className="mr-8">
                  <img src="https://softwarebolt.com/assets/images/badge.png" alt="Software Bolt" height="54" />
                </a>
              </div>
            </div>
            
            <div className="text-gray-400 text-sm">
              © 2025 PiPilot. All rights reserved.
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
