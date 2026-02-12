"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
    Wallet,
    CreditCard,
    ArrowUp,
    ArrowDown,
    Activity,
    Loader2,
} from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from "next/navigation"
import { usePageTitle } from '@/hooks/use-page-title'

interface Team {
    id: string
    user_id: string
    name: string
    description: string | null
    wallet_id: string
    is_default: boolean
    created_at: string
    updated_at: string
    wallet?: {
        balance: number
        currency: string
    }
}

interface Transaction {
    id: string
    amount: number
    type: 'credit' | 'debit'
    description: string
    created_at: string
    status: 'completed' | 'pending' | 'failed'
}

interface TeamStats {
    apiRequests: number
    totalSpent: number
    apiKeys: number
    activeKeys: number
}

export default function WalletPage() {
  usePageTitle('AI Platform Wallet')
    const supabase = createClient()
    const router = useRouter()
    const [currentTeam, setCurrentTeam] = useState<Team | null>(null)
    const [loading, setLoading] = useState(true)

    // Wallet state
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [loadingWallet, setLoadingWallet] = useState(false)
    const [showTopUpDialog, setShowTopUpDialog] = useState(false)
    const [topUpAmount, setTopUpAmount] = useState('10')
    const [realStats, setRealStats] = useState<TeamStats>({
        apiRequests: 0,
        totalSpent: 0,
        apiKeys: 0,
        activeKeys: 0
    })

    useEffect(() => {
        loadTeam()
    }, [])

    useEffect(() => {
        if (currentTeam) {
            loadWalletData()
            loadTeamStats(currentTeam)
        }
    }, [currentTeam])

    async function loadTeam() {
        try {
            setLoading(true)
            const { data: { user } } = await supabase.auth.getUser()

            if (!user) {
                toast.error('Please sign in to continue')
                return
            }

            const storedTeamId = localStorage.getItem('current_ai_team_id')

            if (!storedTeamId) {
                router.push('/ai/platform')
                return
            }

            const { data: team, error } = await supabase
                .from('ai_platform_teams')
                .select(`
                    *,
                    wallet:ai_wallets(balance, currency)
                `)
                .eq('id', storedTeamId)
                .single()

            if (error || !team) {
                router.push('/ai/platform')
                return
            }

            setCurrentTeam(team)
        } catch (error) {
            console.error('Error loading team:', error)
            toast.error('Failed to load team')
        } finally {
            setLoading(false)
        }
    }

    async function loadTeamStats(team: Team) {
        try {
            // Get API keys for this team's user
            const { data: keys, error: keysError } = await supabase
                .from('ai_api_keys')
                .select('*')
                .eq('user_id', team.user_id)

            if (keysError) throw keysError

            // Get usage logs
            const { data: usage, error: usageError } = await supabase
                .from('ai_usage_logs')
                .select('cost')
                .eq('wallet_id', team.wallet_id)
                .eq('user_id', team.user_id)

            if (usageError) throw usageError

            const totalSpent = usage?.reduce((sum, log) => sum + parseFloat(log.cost), 0) || 0
            const apiRequests = usage?.length || 0

            setRealStats({
                apiRequests,
                totalSpent,
                apiKeys: keys?.length || 0,
                activeKeys: keys?.filter(k => k.is_active).length || 0
            })
        } catch (error) {
            console.error('Error loading team stats:', error)
        }
    }

    async function loadWalletData() {
        if (!currentTeam) return

        try {
            setLoadingWallet(true)
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return

            const response = await fetch('/api/ai-api/wallet', {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                },
            })

            if (response.ok) {
                const data = await response.json()
                setTransactions(data.transactions || [])
            }
        } catch (error) {
            console.error('Error loading wallet data:', error)
        } finally {
            setLoadingWallet(false)
        }
    }

    async function handleTopUp() {
        if (!currentTeam) return

        const amount = parseFloat(topUpAmount)
        if (isNaN(amount) || amount < 1 || amount > 1000) {
            toast.error('Amount must be between $1 and $1000')
            return
        }

        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                toast.error('Please sign in to continue')
                return
            }

            const response = await fetch('/api/ai-api/stripe/checkout', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    amount,
                    metadata: {
                        team_id: currentTeam.id,
                        team_name: currentTeam.name
                    }
                }),
            })

            if (!response.ok) {
                throw new Error('Failed to create checkout session')
            }

            const data = await response.json()

            if (data.url) {
                window.location.href = data.url
            }
        } catch (error) {
            console.error('Error creating checkout:', error)
            toast.error('Failed to initiate payment')
        }
    }

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2
        }).format(amount)
    }

    const formatDate = (date: string | null | undefined) => {
        if (!date) return 'N/A'
        try {
            return new Date(date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })
        } catch (e) {
            return 'Invalid Date'
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
            </div>
        )
    }

    if (!currentTeam) return null

    return (
        <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col gap-4">
                <div>
                    <h1 className="text-4xl font-bold text-white mb-2">Wallet & Billing</h1>
                    <p className="text-gray-400">Manage credits and view transaction history for {currentTeam.name}</p>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                {/* Balance Card */}
                <Card className="bg-gradient-to-br from-purple-900/20 to-purple-700/10 border-purple-500/20 backdrop-blur-xl">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-purple-200">Current Balance</p>
                                <h3 className="text-3xl font-bold text-white mt-1">
                                    {currentTeam?.wallet ? formatCurrency(currentTeam.wallet.balance) : '$0.00'}
                                </h3>
                            </div>
                            <div className="p-3 bg-purple-500/20 rounded-lg">
                                <Wallet className="h-6 w-6 text-purple-400" />
                            </div>
                        </div>
                        <Button
                            onClick={() => setShowTopUpDialog(true)}
                            size="sm"
                            className="mt-4 w-full bg-purple-600 hover:bg-purple-500"
                        >
                            <CreditCard className="mr-2 h-4 w-4" />
                            Top Up Balance
                        </Button>
                    </CardContent>
                </Card>

                {/* Quick Stats */}
                <Card className="bg-gray-900/50 backdrop-blur-xl border-white/5">
                    <CardContent className="p-6">
                        <h4 className="text-white font-medium mb-4">Quick Stats</h4>
                        <div className="space-y-3">
                            <div className="flex justify-between">
                                <span className="text-gray-400">API Requests</span>
                                <span className="text-white">{realStats.apiRequests.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Total Spent</span>
                                <span className="text-white">{formatCurrency(realStats.totalSpent)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Active Keys</span>
                                <span className="text-white">{realStats.activeKeys}</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Transaction History */}
            <Card className="bg-gray-900/50 backdrop-blur-xl border-white/5">
                <CardHeader>
                    <CardTitle className="text-white">Transaction History</CardTitle>
                    <CardDescription className="text-gray-400">
                        Recent transactions and balance changes
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loadingWallet ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
                        </div>
                    ) : transactions.length === 0 ? (
                        <div className="text-center py-8">
                            <Activity className="mx-auto h-12 w-12 text-gray-600 opacity-20 mb-2" />
                            <p className="text-gray-400">No transactions yet</p>
                            <p className="text-gray-500 text-sm mt-2">Your transaction history will appear here</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {transactions.map((transaction) => (
                                <div key={transaction.id} className="flex items-center justify-between p-4 bg-gray-800/30 rounded-lg border border-white/5">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg ${transaction.type === 'credit' ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                                            {transaction.type === 'credit' ? (
                                                <ArrowUp className="h-4 w-4 text-green-400" />
                                            ) : (
                                                <ArrowDown className="h-4 w-4 text-red-400" />
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-white font-medium">{transaction.description}</p>
                                            <p className="text-gray-400 text-sm">{formatDate(transaction.created_at)}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className={`font-medium ${transaction.type === 'credit' ? 'text-green-400' : 'text-red-400'}`}>
                                            {transaction.type === 'credit' ? '+' : '-'}{formatCurrency(transaction.amount)}
                                        </p>
                                        <Badge variant="outline" className={`text-xs ${transaction.status === 'completed' ? 'border-green-500/20 text-green-400' :
                                            transaction.status === 'pending' ? 'border-yellow-500/20 text-yellow-400' :
                                                'border-red-500/20 text-red-400'
                                            }`}>
                                            {transaction.status}
                                        </Badge>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Top Up Dialog */}
            <Dialog open={showTopUpDialog} onOpenChange={setShowTopUpDialog}>
                <DialogContent className="bg-gray-900 border-white/10">
                    <DialogHeader>
                        <DialogTitle className="text-white">Top Up Wallet</DialogTitle>
                        <DialogDescription className="text-gray-400">
                            Add credits to {currentTeam?.name}'s wallet
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
                            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500"
                        >
                            <CreditCard className="mr-2 h-4 w-4" />
                            Proceed to Payment
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
