"use client"

import { useState, useEffect } from "react"
import { Logo } from "@/components/ui/logo"
import { Button } from "@/components/ui/button"
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu"
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { 
  Menu, 
  X, 
  User, 
  Settings, 
  LogOut, 
  Briefcase, 
  Rocket,
  Bell,
  ChevronDown,
  Zap,
  Database,
  Coins,
  CreditCard,
  TrendingUp,
  AlertTriangle,
  Loader2,
  Server,
  Code
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"
import { useSubscriptionCache } from "@/hooks/use-subscription-cache"
import { NotificationCenter } from "@/components/notification-center"
import { checkAdminAccess } from "@/lib/admin-utils"
import { Shield, Crown } from "lucide-react"

export function Navigation() {
  const [user, setUser] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobile, setIsMobile] = useState(true)

  // Subscription status hook
  const { subscription, loading: subscriptionLoading } = useSubscriptionCache(user?.id)

  // Credit balance state
  const [creditBalance, setCreditBalance] = useState<number | null>(null)
  const [currentPlan, setCurrentPlan] = useState<string>('free')
  const [estimatedMessages, setEstimatedMessages] = useState<number>(0)
  const [loadingCredits, setLoadingCredits] = useState(true)
  const [showTopUpDialog, setShowTopUpDialog] = useState(false)
  const [topUpAmount, setTopUpAmount] = useState('10')
  const [processingTopUp, setProcessingTopUp] = useState(false)

  useEffect(() => {
    checkUser()
    
    // Add scroll event listener
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10)
    }
    
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Responsive detection - same as FeatureShowcase
  useEffect(() => {
    const updateDeviceType = () => {
      const width = window.innerWidth;
      // Mobile/tablet: < 1024px (same as FeatureShowcase tablet breakpoint)
      // Desktop: >= 1024px
      setIsMobile(width < 1024);
    };

    updateDeviceType();
    window.addEventListener('resize', updateDeviceType);
    return () => window.removeEventListener('resize', updateDeviceType);
  }, []);

  // Fetch credit balance when user changes
  useEffect(() => {
    if (user?.id) {
      fetchCreditBalance(user.id)
    }
  }, [user?.id])

  const checkUser = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    } catch (error) {
      console.error("Error checking user:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
      setUser(null)
      setIsUserDropdownOpen(false)
    } catch (error) {
      console.error("Error logging out:", error)
    }
  }

  const fetchCreditBalance = async (userId: string) => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('wallet')
        .select('credits_balance, current_plan, credits_used_this_month')
        .eq('user_id', userId)
        .single()

      if (error) {
        console.error('Error fetching credit balance:', error)
        return
      }

      if (data) {
        setCreditBalance(data.credits_balance)
        setCurrentPlan(data.current_plan)
        setEstimatedMessages(Math.floor(data.credits_balance / 0.25))
      }
    } catch (error) {
      console.error('Exception fetching credit balance:', error)
    } finally {
      setLoadingCredits(false)
    }
  }

  const handleTopUp = async () => {
    if (!user) {
      // Redirect to login if not authenticated
      window.location.href = '/auth/login'
      return
    }

    // Free users should upgrade first
    if (currentPlan === 'free') {
      window.location.href = '/pricing'
      return
    }

    const amount = parseFloat(topUpAmount)
    if (isNaN(amount) || amount < 1 || amount > 1000) {
      alert('Amount must be between $1 and $1000')
      return
    }

    setProcessingTopUp(true)

    try {
      const response = await fetch('/api/stripe/purchase-credits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          credits: Math.floor(amount), // Convert dollars to credits (1:1 ratio)
        }),
      })

      const result = await response.json()

      if (response.ok && result.url) {
        // Redirect to Stripe Checkout
        window.location.href = result.url
      } else {
        throw new Error(result.error || 'Failed to create credit purchase session')
      }
    } catch (error: any) {
      console.error('Error creating credit purchase session:', error)
      alert('Failed to start credit purchase. Please try again.')
    } finally {
      setProcessingTopUp(false)
    }
  }

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      isScrolled 
        ? 'bg-white/10 backdrop-blur-xl border-b border-white/20 shadow-2xl shadow-black/20' 
        : 'bg-transparent'
    }`}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Left Side - Logo */}
          {!isMobile && (
            <div className="flex items-center space-x-2">
              <Link href="/">
                <Logo variant="text" size="md" />
              </Link>
            </div>
          )}

          {/* Center - Navigation Links (Desktop) */}
          {!isMobile && (
            <div className="flex items-center space-x-8">
              {/* Products Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="text-white hover:text-orange-400 transition-colors flex items-center gap-1">
                    Products
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 bg-gray-800 border-gray-700">
                  <Link href="/">
                    <DropdownMenuItem className="text-white hover:bg-gray-700 cursor-pointer">
                      <Zap className="w-4 h-4 mr-2" />
                      <div>
                        <div className="font-medium">PiPilot</div>
                        <div className="text-xs text-gray-400">Build apps with chat</div>
                      </div>
                    </DropdownMenuItem>
                  </Link>
                  <Link href="/products/database">
                    <DropdownMenuItem className="text-white hover:bg-gray-700 cursor-pointer">
                      <Database className="w-4 h-4 mr-2" />
                      <div>
                        <div className="font-medium">Database</div>
                        <div className="text-xs text-gray-400">PostgreSQL as a service</div>
                      </div>
                    </DropdownMenuItem>
                  </Link>
                  <a href="https://swe.pipilot.dev" target="_blank" rel="noopener noreferrer">
                    <DropdownMenuItem className="text-white hover:bg-gray-700 cursor-pointer">
                      <Code className="w-4 h-4 mr-2" />
                      <div>
                        <div className="font-medium">PiPilot SWE Agent</div>
                        <div className="text-xs text-gray-400">AI-powered software engineering</div>
                      </div>
                    </DropdownMenuItem>
                  </a>
                </DropdownMenuContent>
              </DropdownMenu>
              
              <Link href="/community" className="text-white hover:text-orange-400 transition-colors">
                Community
              </Link>
              <Link href="/enterprise" className="text-white hover:text-orange-400 transition-colors">
                Business
              </Link>
              <Link href="/pricing" className="text-white hover:text-orange-400 transition-colors">
                Plans
              </Link>
              <Link href="/docs" className="text-white hover:text-orange-400 transition-colors">
                Docs
              </Link>
              <Link href="/support" className="text-white hover:text-orange-400 transition-colors">
                Support
              </Link>
            </div>
          )}

          {/* Right Side - Desktop */}
          {!isMobile && (
            <div className="flex items-center space-x-4">
              {/* Icons - Only show when logged in */}
              {!isLoading && user && (
                <>
                  {/* Subscription Status */}
                  {!subscriptionLoading && subscription && (
                    <div className="flex items-center space-x-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/20">
                      <Crown className="w-4 h-4 text-orange-400" />
                      <span className="text-sm font-medium text-white">
                        {(subscription.plan === 'pro' || subscription.plan === 'creator') ? 'Creator' :
                         (subscription.plan === 'teams' || subscription.plan === 'collaborate') ? 'Collaborate' :
                         (subscription.plan === 'enterprise' || subscription.plan === 'scale') ? 'Scale' :
                         'Free'}
                      </span>
                    </div>
                  )}

                  {/* Credits Section */}
                  {!loadingCredits && creditBalance !== null && (
                    <div className="flex items-center space-x-2 px-3 py-1 rounded-full bg-gradient-to-r from-green-500/20 to-emerald-500/20 backdrop-blur-sm border border-green-500/30">
                      <Coins className="w-4 h-4 text-green-400" />
                      <span className="text-sm font-medium text-green-300">
                        {creditBalance.toFixed(2)} credits
                      </span>
                      {creditBalance <= 2 && (
                        <AlertTriangle className="w-3 h-3 text-orange-400" />
                      )}
                    </div>
                  )}

                  <NotificationCenter />
                </>
              )}

              {/* User Profile or Auth Buttons */}
              {!isLoading && (
                <>
                  {user ? (
                    <DropdownMenu open={isUserDropdownOpen} onOpenChange={setIsUserDropdownOpen}>
                      <DropdownMenuTrigger asChild>
                        <button className="flex items-center space-x-3 text-white hover:text-gray-300 transition-colors">
                          <div className="w-8 h-8 rounded-full bg-orange-600 flex items-center justify-center">
                            <span className="text-white text-sm font-medium">
                              {user.email?.charAt(0).toUpperCase() || 'U'}
                            </span>
                          </div>
                          <span className="text-white text-sm hidden lg:block">
                            {user.email?.split('@')[0] || 'User'}
                          </span>
                        </button>
                      </DropdownMenuTrigger>
                                           <DropdownMenuContent align="end" className="w-56 bg-gray-800 border-gray-700">
                         {/* Credits Section in Dropdown */}
                         {!loadingCredits && creditBalance !== null && (
                           <div className="px-3 py-3 border-b border-gray-700">
                             <div className="flex items-center justify-between mb-2">
                               <div className="flex items-center space-x-2">
                                 <Coins className="w-4 h-4 text-green-400" />
                                 <span className="text-sm font-medium text-green-300">
                                   {creditBalance.toFixed(2)} credits
                                 </span>
                               </div>
                               {creditBalance <= 2 && (
                                 <AlertTriangle className="w-3 h-3 text-orange-400" />
                               )}
                             </div>
                             <div className="text-xs text-gray-400">
                               ~{estimatedMessages} messages remaining • {currentPlan} Plan
                             </div>
                             {/* Top Up Button for Low Balance */}
                             {(creditBalance <= 2 || currentPlan === 'free') && (
                               <Button
                                 size="sm"
                                 variant="outline"
                                 className="w-full h-7 text-xs mt-2 border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-300 dark:hover:bg-green-950"
                                 onClick={() => setShowTopUpDialog(true)}
                               >
                                 <CreditCard className="h-3 w-3 mr-1" />
                                 {currentPlan === 'free' ? 'Upgrade & Buy Credits' : 'Buy Credits'}
                               </Button>
                             )}
                           </div>
                         )}
                         <Link href="/workspace/account">
                           <DropdownMenuItem className="text-white hover:bg-gray-700 cursor-pointer">
                             <User className="w-4 h-4 mr-2" />
                             Account
                           </DropdownMenuItem>
                         </Link>
                         <Link href="/workspace">
                           <DropdownMenuItem className="text-white hover:bg-gray-700 cursor-pointer">
                             <Briefcase className="w-4 h-4 mr-2" />
                             Workspace
                           </DropdownMenuItem>
                         </Link>
                         {user && checkAdminAccess(user) && (
                           <>
                             <DropdownMenuSeparator className="bg-gray-700" />
                             <Link href="/admin">
                               <DropdownMenuItem className="text-white hover:bg-gray-700 cursor-pointer">
                                 <Shield className="w-4 h-4 mr-2" />
                                 Admin Panel
                               </DropdownMenuItem>
                             </Link>
                           </>
                         )}
                         <Link href="/database">
                           <DropdownMenuItem className="text-white hover:bg-gray-700 cursor-pointer">
                             <Database className="w-4 h-4 mr-2" />
                             Database
                           </DropdownMenuItem>
                         </Link>
                         <Link href="/workspace/deployment">
                           <DropdownMenuItem className="text-white hover:bg-gray-700 cursor-pointer">
                             <Rocket className="w-4 h-4 mr-2" />
                             Deploy
                           </DropdownMenuItem>
                         </Link>
                         <DropdownMenuSeparator className="bg-gray-700" />
                         <DropdownMenuItem 
                           className="text-white hover:bg-gray-700"
                           onClick={handleLogout}
                         >
                           <LogOut className="w-4 h-4 mr-2" />
                           Logout
                         </DropdownMenuItem>
                       </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <div className="flex items-center space-x-4">
                      <Link href="/auth/login">
                        <Button variant="ghost" className="text-white hover:transition-all duration-300 cursor-pointer">
                          Log in
                        </Button>
                      </Link>
                      <Link href="/auth/signup">
                        <Button className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-3 font-semibold rounded-full shadow-lg shadow-orange-500/20 transition-all duration-300 cursor-pointer">
                          Get started
                        </Button>
                      </Link>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Mobile Navigation - Always visible on mobile/tablet */}
          {isMobile && (
            <div className="flex items-center justify-between w-full">
              {/* Left - Logo */}
              <div className="flex items-center">
                <Link href="/">
                  <Logo variant="text" size="md" showSubtitle={false} />
                </Link>
              </div>

              {/* Right - Auth Section */}
              {!isLoading && (
                <>
                  {user ? (
                    /* Mobile Logged-in Layout */
                    <div className="flex items-center space-x-2">
                      {/* Notification Center */}
                      <NotificationCenter />

                      {/* Profile Icon Trigger */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="text-white hover:text-gray-300 transition-colors p-2">
                            <div className="w-8 h-8 rounded-full bg-orange-600 flex items-center justify-center">
                              <span className="text-white text-sm font-medium">
                                {user.email?.charAt(0).toUpperCase() || 'U'}
                              </span>
                            </div>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-64 bg-gray-800 border-gray-700">
                          {/* Subscription Status in Dropdown */}
                          {!subscriptionLoading && subscription && (
                            <div className="px-3 py-3 border-b border-gray-700">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center space-x-2">
                                  <Crown className="w-4 h-4 text-orange-400" />
                                  <span className="text-sm font-medium text-white">
                                    {(subscription.plan === 'pro' || subscription.plan === 'creator') ? 'Creator Plan' :
                                     (subscription.plan === 'teams' || subscription.plan === 'collaborate') ? 'Collaborate Plan' :
                                     (subscription.plan === 'enterprise' || subscription.plan === 'scale') ? 'Scale Plan' :
                                     'Free Plan'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Credits Section in Dropdown */}
                          {!loadingCredits && creditBalance !== null && (
                            <div className="px-3 py-3 border-b border-gray-700">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center space-x-2">
                                  <Coins className="w-4 h-4 text-green-400" />
                                  <span className="text-sm font-medium text-green-300">
                                    {creditBalance.toFixed(2)} credits
                                  </span>
                                </div>
                                {creditBalance <= 2 && (
                                  <AlertTriangle className="w-3 h-3 text-orange-400" />
                                )}
                              </div>
                              <div className="text-xs text-gray-400">
                                ~{estimatedMessages} messages remaining • {currentPlan} Plan
                              </div>
                              {/* Top Up Button for Low Balance */}
                              {(creditBalance <= 2 || currentPlan === 'free') && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="w-full h-7 text-xs mt-2 border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-300 dark:hover:bg-green-950"
                                  onClick={() => setShowTopUpDialog(true)}
                                >
                                  <CreditCard className="h-3 w-3 mr-1" />
                                  {currentPlan === 'free' ? 'Upgrade & Buy Credits' : 'Buy Credits'}
                                </Button>
                              )}
                            </div>
                          )}

                          <Link href="/workspace/account">
                            <DropdownMenuItem className="text-white hover:bg-gray-700 cursor-pointer">
                              <User className="w-4 h-4 mr-2" />
                              Account
                            </DropdownMenuItem>
                          </Link>
                          <Link href="/workspace">
                            <DropdownMenuItem className="text-white hover:bg-gray-700 cursor-pointer">
                              <Briefcase className="w-4 h-4 mr-2" />
                              Workspace
                            </DropdownMenuItem>
                          </Link>
                          {user && checkAdminAccess(user) && (
                            <>
                              <DropdownMenuSeparator className="bg-gray-700" />
                              <Link href="/admin">
                                <DropdownMenuItem className="text-white hover:bg-gray-700 cursor-pointer">
                                  <Shield className="w-4 h-4 mr-2" />
                                  Admin Panel
                                </DropdownMenuItem>
                              </Link>
                            </>
                          )}
                          <Link href="/database">
                            <DropdownMenuItem className="text-white hover:bg-gray-700 cursor-pointer">
                              <Database className="w-4 h-4 mr-2" />
                              Database
                            </DropdownMenuItem>
                          </Link>
                          <Link href="/workspace/deployment">
                            <DropdownMenuItem className="text-white hover:bg-gray-700 cursor-pointer">
                              <Rocket className="w-4 h-4 mr-2" />
                              Deploy
                            </DropdownMenuItem>
                          </Link>
                          <DropdownMenuSeparator className="bg-gray-700" />
                          <DropdownMenuItem
                            className="text-white hover:bg-gray-700"
                            onClick={handleLogout}
                          >
                            <LogOut className="w-4 h-4 mr-2" />
                            Logout
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ) : (
                    /* Mobile Non-logged-in Layout */
                    <div className="flex items-center space-x-4">
                      <Link href="/auth/login">
                        <Button variant="ghost" className="text-white hover:transition-all duration-300 cursor-pointer">
                          Log in
                        </Button>
                      </Link>
                      <Link href="/auth/signup">
                        <Button className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-3 font-semibold rounded-full shadow-lg shadow-orange-500/20 transition-all duration-300 cursor-pointer">
                          Get started
                        </Button>
                      </Link>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
      </div></div>

      {/* Credit Top-Up Dialog */}
      <Dialog open={showTopUpDialog} onOpenChange={setShowTopUpDialog}>
        <DialogContent className="bg-gray-900 border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">Buy Credits</DialogTitle>
            <DialogDescription className="text-gray-400">
              {currentPlan === 'free'
                ? 'Upgrade to a paid plan to purchase credits. $1 = 1 credit.'
                : `Purchase additional credits for your ${currentPlan} plan. $1 = 1 credit.`
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-white">Amount (USD)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <Input
                  type="number"
                  min="1"
                  max="1000"
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  className="bg-gray-800/50 border-white/10 text-white pl-7"
                  placeholder="10.00"
                />
              </div>
              <p className="text-xs text-gray-400">Minimum: $1.00, Maximum: $1,000.00</p>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[10, 25, 50, 100].map(amount => (
                <Button
                  key={amount}
                  variant="outline"
                  size="sm"
                  onClick={() => setTopUpAmount(amount.toString())}
                  className="border-white/10 text-white hover:bg-white/5"
                >
                  ${amount}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleTopUp}
              disabled={processingTopUp}
              className="bg-orange-600 hover:bg-orange-500"
            >
              {processingTopUp ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Proceed to Payment
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </nav>
  )
}
