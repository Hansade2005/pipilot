"use client"

import { useEffect, useState, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    CreditCard,
    DollarSign,
    TrendingUp,
    Users,
    Search,
    Edit,
    Plus,
    Minus,
    Loader2,
    Sparkles,
    Coins,
    ArrowUp,
    ArrowDown
} from "lucide-react"
import { toast } from "sonner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { usePageTitle } from '@/hooks/use-page-title'

interface UserWallet {
    id: string
    user_id: string
    credits_balance: number
    credits_used_this_month: number
    credits_used_total: number
    current_plan: string
    subscription_status: string
    created_at: string
    updated_at: string
    profile: {
        email: string
        full_name?: string
        avatar_url?: string
    }
    transactions: {
        total: number
        recent: Array<{
            id: string
            amount: number
            type: string
            description: string
            created_at: string
        }>
    }
}

interface Transaction {
    id: string
    user_id: string
    amount: number
    type: string
    description: string
    credits_before: number
    credits_after: number
    created_at: string
    user: {
        email: string
        full_name?: string
    }
}

interface CreditStats {
    totalUsers: number
    totalCredits: number
    averageCredits: number
    activeWallets: number
}

export default function AdminCreditsPage() {
  usePageTitle('Credits Management')
    const [wallets, setWallets] = useState<UserWallet[]>([])
    const [loading, setLoading] = useState(true)
    const [stats, setStats] = useState<CreditStats>({ totalUsers: 0, totalCredits: 0, averageCredits: 0, activeWallets: 0 })
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedWallet, setSelectedWallet] = useState<UserWallet | null>(null)
    const [showBalanceDialog, setShowBalanceDialog] = useState(false)
    const [balanceAdjustment, setBalanceAdjustment] = useState('')
    const [adjustmentType, setAdjustmentType] = useState<'add' | 'subtract'>('add')
    const [adjustmentReason, setAdjustmentReason] = useState('')
    const [adjusting, setAdjusting] = useState(false)
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [transactionsLoading, setTransactionsLoading] = useState(false)

    // Animated stats
    const [animatedStats, setAnimatedStats] = useState({
        totalUsers: 0,
        totalCredits: 0,
        averageCredits: 0,
        activeWallets: 0
    })

    const initialAnimationDone = useRef(false)

    useEffect(() => {
        loadWallets()
        loadTransactions()
    }, [])

    // Animate numbers
    useEffect(() => {
        if (!wallets.length && !stats.totalUsers) return

        const targetStats = {
            totalUsers: stats.totalUsers,
            totalCredits: stats.totalCredits,
            averageCredits: stats.averageCredits,
            activeWallets: stats.activeWallets
        }

        if (initialAnimationDone.current) {
            setAnimatedStats(targetStats)
            return
        }

        const duration = 1000
        const steps = 60
        const interval = duration / steps

        let step = 0
        const timer = setInterval(() => {
            step++
            const progress = step / steps

            setAnimatedStats({
                totalUsers: Math.floor(targetStats.totalUsers * progress),
                totalCredits: Math.floor(targetStats.totalCredits * progress),
                averageCredits: Math.floor(targetStats.averageCredits * progress),
                activeWallets: Math.floor(targetStats.activeWallets * progress)
            })

            if (step >= steps) {
                clearInterval(timer)
                setAnimatedStats(targetStats)
                initialAnimationDone.current = true
            }
        }, interval)

        return () => clearInterval(timer)
    }, [wallets, stats])

    const loadWallets = async () => {
        try {
            setLoading(true)
            const response = await fetch('/api/admin/credits')
            if (response.ok) {
                const data = await response.json()
                setWallets(data.wallets || [])
                setStats(data.stats || { totalUsers: 0, totalCredits: 0, averageCredits: 0, activeWallets: 0 })
            } else {
                toast.error('Failed to load credit wallets')
            }
        } catch (error) {
            console.error('Error loading wallets:', error)
            toast.error('Failed to load credit wallets')
        } finally {
            setLoading(false)
        }
    }

    const loadTransactions = async () => {
        try {
            setTransactionsLoading(true)
            const response = await fetch('/api/admin/credit-transactions')
            if (response.ok) {
                const data = await response.json()
                setTransactions(data.transactions || [])
            } else {
                toast.error('Failed to load credit transactions')
            }
        } catch (error) {
            console.error('Error loading transactions:', error)
            toast.error('Failed to load credit transactions')
        } finally {
            setTransactionsLoading(false)
        }
    }

    const filteredWallets = wallets.filter(wallet =>
        wallet.profile.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (wallet.profile.full_name && wallet.profile.full_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        wallet.current_plan.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const handleBalanceAdjustment = async () => {
        if (!selectedWallet || !balanceAdjustment || !adjustmentReason) {
            toast.error('Please fill in all fields')
            return
        }

        const amount = parseFloat(balanceAdjustment)
        if (isNaN(amount) || amount <= 0) {
            toast.error('Please enter a valid positive amount')
            return
        }

        setAdjusting(true)
        try {
            const response = await fetch(`/api/admin/credits/${selectedWallet.id}/adjust`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: adjustmentType === 'add' ? amount : -amount,
                    reason: adjustmentReason,
                    type: 'admin_adjustment'
                })
            })

            if (response.ok) {
                toast.success(`Credits ${adjustmentType === 'add' ? 'increased' : 'decreased'} by ${amount}`)
                setShowBalanceDialog(false)
                setBalanceAdjustment('')
                setAdjustmentReason('')
                setSelectedWallet(null)
                await loadWallets()
            } else {
                const error = await response.json()
                toast.error(error.error || 'Failed to adjust credits')
            }
        } catch (error) {
            console.error('Error adjusting credits:', error)
            toast.error('Failed to adjust credits')
        } finally {
            setAdjusting(false)
        }
    }

    const formatNumber = (num: number) => {
        return new Intl.NumberFormat('en-US').format(num)
    }

    const statCards = [
        {
            title: "Total Users",
            value: animatedStats.totalUsers,
            change: 0,
            icon: Users,
            color: "from-blue-500 to-cyan-500",
            bgColor: "from-blue-500/10 to-cyan-500/10"
        },
        {
            title: "Total Credits",
            value: formatNumber(animatedStats.totalCredits),
            change: 0,
            icon: Coins,
            color: "from-green-500 to-emerald-500",
            bgColor: "from-green-500/10 to-emerald-500/10"
        },
        {
            title: "Average Credits",
            value: formatNumber(Math.round(animatedStats.averageCredits)),
            change: 0,
            icon: TrendingUp,
            color: "from-purple-500 to-pink-500",
            bgColor: "from-purple-500/10 to-pink-500/10"
        },
        {
            title: "Active Wallets",
            value: animatedStats.activeWallets,
            change: 0,
            icon: CreditCard,
            color: "from-orange-500 to-red-500",
            bgColor: "from-orange-500/10 to-red-500/10"
        }
    ]

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-white" />
                    <p className="text-gray-400">Loading credit wallets...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white">User Credits</h1>
                    <p className="text-gray-400">Manage user credit balances and transactions</p>
                </div>
                <Button
                    onClick={loadWallets}
                    variant="outline"
                    className="border-white/10 text-white hover:bg-white/5"
                >
                    <Loader2 className="h-4 w-4 mr-2" />
                    Refresh
                </Button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {statCards.map((stat, index) => (
                    <Card key={index} className="bg-gray-900/50 backdrop-blur-xl border-white/5">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-gray-400">{stat.title}</p>
                                    <p className="text-2xl font-bold text-white">{stat.value}</p>
                                </div>
                                <div className={`p-3 rounded-lg bg-gradient-to-br ${stat.bgColor}`}>
                                    <stat.icon className={`h-6 w-6 bg-gradient-to-br ${stat.color} bg-clip-text text-transparent`} />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Main Content */}
            <Tabs defaultValue="wallets" className="space-y-6">
                <TabsList className="bg-gray-900/50 backdrop-blur-xl border-white/10">
                    <TabsTrigger value="wallets" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600/20 data-[state=active]:to-pink-600/20 data-[state=active]:text-white">
                        User Wallets
                    </TabsTrigger>
                    <TabsTrigger value="transactions" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600/20 data-[state=active]:to-pink-600/20 data-[state=active]:text-white">
                        Credit Transactions
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="wallets" className="space-y-4">
                    {/* Search */}
                    <div className="flex items-center gap-4">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                                placeholder="Search users by email, name, or plan..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 bg-gray-900/50 border-white/10 text-white placeholder:text-gray-500"
                            />
                        </div>
                    </div>

                    {/* Wallets List */}
                    {filteredWallets.length === 0 ? (
                        <Card className="bg-gray-900/50 backdrop-blur-xl border-white/5">
                            <CardContent className="text-center py-12">
                                <CreditCard className="mx-auto h-12 w-12 mb-4 opacity-20 text-gray-600" />
                                <p className="text-gray-400 mb-4">
                                    {searchQuery ? 'No wallets found matching your search' : 'No user wallets found'}
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-4">
                            {filteredWallets.map((wallet) => (
                                <Card key={wallet.id} className="bg-gray-900/50 backdrop-blur-xl border-white/5">
                                    <CardContent className="p-6">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <Avatar className="h-12 w-12">
                                                    <AvatarImage src={wallet.profile.avatar_url} />
                                                    <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white">
                                                        {wallet.profile.email.charAt(0).toUpperCase()}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <h3 className="text-lg font-semibold text-white">
                                                        {wallet.profile.full_name || wallet.profile.email}
                                                    </h3>
                                                    <p className="text-sm text-gray-400">{wallet.profile.email}</p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <Badge variant="outline" className="border-green-500/30 text-green-400">
                                                            {formatNumber(wallet.credits_balance)} credits
                                                        </Badge>
                                                        <Badge variant="outline" className="border-blue-500/30 text-blue-400">
                                                            {wallet.current_plan}
                                                        </Badge>
                                                        <Badge variant="outline" className="border-purple-500/30 text-purple-400">
                                                            {wallet.transactions.total} transactions
                                                        </Badge>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => {
                                                        setSelectedWallet(wallet)
                                                        setShowBalanceDialog(true)
                                                    }}
                                                    className="border-white/10 text-white hover:bg-white/5"
                                                >
                                                    <Edit className="h-4 w-4 mr-2" />
                                                    Adjust Credits
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Usage Stats */}
                                        <div className="mt-4 pt-4 border-t border-white/10">
                                            <div className="grid grid-cols-3 gap-4 text-sm">
                                                <div>
                                                    <p className="text-gray-400">Used This Month</p>
                                                    <p className="text-white font-medium">{formatNumber(wallet.credits_used_this_month)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-gray-400">Total Used</p>
                                                    <p className="text-white font-medium">{formatNumber(wallet.credits_used_total)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-gray-400">Subscription</p>
                                                    <p className="text-white font-medium capitalize">{wallet.subscription_status}</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Recent Transactions */}
                                        {wallet.transactions.recent.length > 0 && (
                                            <div className="mt-4 pt-4 border-t border-white/10">
                                                <h4 className="text-sm font-medium text-gray-300 mb-2">Recent Transactions</h4>
                                                <div className="space-y-2">
                                                    {wallet.transactions.recent.slice(0, 3).map((transaction: { id: string; amount: number; type: string; description: string; created_at: string }) => (
                                                        <div key={transaction.id} className="flex items-center justify-between text-sm">
                                                            <span className="text-gray-400">{transaction.description}</span>
                                                            <div className="flex items-center gap-2">
                                                                <span className={`font-medium ${transaction.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                                    {transaction.amount > 0 ? '+' : ''}{formatNumber(transaction.amount)}
                                                                </span>
                                                                <span className="text-xs text-gray-500">
                                                                    {new Date(transaction.created_at).toLocaleDateString()}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="transactions" className="space-y-4">
                    {/* Search and Filters */}
                    <div className="flex items-center gap-4">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                                placeholder="Search transactions..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 bg-gray-900/50 border-white/10 text-white placeholder-gray-400"
                            />
                        </div>
                        <Button
                            onClick={() => {
                                loadTransactions()
                                loadWallets()
                            }}
                            variant="outline"
                            className="border-white/10 text-white hover:bg-white/5"
                        >
                            <Loader2 className="h-4 w-4 mr-2" />
                            Refresh
                        </Button>
                    </div>

                    {/* Transactions Table */}
                    <Card className="bg-gray-900/50 backdrop-blur-xl border-white/5">
                        <CardHeader>
                            <CardTitle className="text-white">Credit Transactions</CardTitle>
                            <CardDescription className="text-gray-400">
                                All credit transactions across the platform
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {transactionsLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="h-8 w-8 animate-spin text-white" />
                                    <span className="ml-2 text-gray-400">Loading transactions...</span>
                                </div>
                            ) : transactions.length === 0 ? (
                                <div className="text-center py-12">
                                    <Coins className="mx-auto h-12 w-12 mb-4 opacity-20 text-gray-600" />
                                    <p className="text-gray-400">No credit transactions found</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {transactions
                                        .filter(transaction =>
                                            (transaction.user && transaction.user.email && transaction.user.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
                                            transaction.description.toLowerCase().includes(searchQuery.toLowerCase())
                                        )
                                        .map((transaction) => (
                                            <div key={transaction.id} className="flex items-center justify-between p-4 bg-gray-800/30 rounded-lg border border-white/5">
                                                <div className="flex items-center gap-4">
                                                    <div className={`p-2 rounded-lg ${
                                                        transaction.type === 'purchase' ? 'bg-green-500/10' :
                                                        transaction.type === 'usage' ? 'bg-red-500/10' :
                                                        transaction.type === 'subscription_grant' ? 'bg-blue-500/10' :
                                                        transaction.type === 'bonus' ? 'bg-purple-500/10' :
                                                        transaction.type === 'adjustment' ? 'bg-yellow-500/10' :
                                                        'bg-gray-500/10'
                                                    }`}>
                                                        {transaction.type === 'purchase' ? <ArrowUp className="h-4 w-4 text-green-400" /> :
                                                         transaction.type === 'usage' ? <ArrowDown className="h-4 w-4 text-red-400" /> :
                                                         transaction.type === 'subscription_grant' ? <Sparkles className="h-4 w-4 text-blue-400" /> :
                                                         transaction.type === 'bonus' ? <Coins className="h-4 w-4 text-purple-400" /> :
                                                         transaction.type === 'adjustment' ? <Edit className="h-4 w-4 text-yellow-400" /> :
                                                         <CreditCard className="h-4 w-4 text-gray-400" />}
                                                    </div>
                                                    <div>
                                                        <p className="text-white font-medium">{transaction.description}</p>
                                                        <p className="text-sm text-gray-400">
                                                            {transaction.user?.email || 'Unknown'} • {new Date(transaction.created_at).toLocaleDateString()} {new Date(transaction.created_at).toLocaleTimeString()}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className={`font-medium ${
                                                        transaction.amount > 0 ? 'text-green-400' : 'text-red-400'
                                                    }`}>
                                                        {transaction.amount > 0 ? '+' : ''}{formatNumber(transaction.amount)}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        Balance: {formatNumber(transaction.credits_after)}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Balance Adjustment Dialog */}
            <Dialog open={showBalanceDialog} onOpenChange={setShowBalanceDialog}>
                <DialogContent className="bg-gray-900 border-white/10">
                    <DialogHeader>
                        <DialogTitle className="text-white">Adjust Credit Balance</DialogTitle>
                        <DialogDescription className="text-gray-400">
                            {selectedWallet && `Adjusting credits for ${selectedWallet.profile.email}`}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        {selectedWallet && (
                            <div className="p-4 bg-gray-800/50 rounded-lg">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-gray-400">Current Balance</p>
                                        <p className="text-2xl font-bold text-white">{formatNumber(selectedWallet.credits_balance)} credits</p>
                                    </div>
                                    <Avatar className="h-12 w-12">
                                        <AvatarImage src={selectedWallet.profile.avatar_url} />
                                        <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white">
                                            {selectedWallet.profile.email.charAt(0).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="adjustment-type" className="text-white">Adjustment Type</Label>
                                <Select value={adjustmentType} onValueChange={(value: 'add' | 'subtract') => setAdjustmentType(value)}>
                                    <SelectTrigger className="bg-gray-800/50 border-white/10 text-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-gray-800 border-white/10">
                                        <SelectItem value="add" className="text-white hover:bg-white/5">
                                            <div className="flex items-center gap-2">
                                                <Plus className="h-4 w-4 text-green-400" />
                                                Add Credits
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="subtract" className="text-white hover:bg-white/5">
                                            <div className="flex items-center gap-2">
                                                <Minus className="h-4 w-4 text-red-400" />
                                                Subtract Credits
                                            </div>
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="amount" className="text-white">Amount</Label>
                                <Input
                                    id="amount"
                                    type="number"
                                    step="1"
                                    min="0"
                                    value={balanceAdjustment}
                                    onChange={(e) => setBalanceAdjustment(e.target.value)}
                                    placeholder="0"
                                    className="bg-gray-800/50 border-white/10 text-white"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="reason" className="text-white">Reason</Label>
                            <Input
                                id="reason"
                                value={adjustmentReason}
                                onChange={(e) => setAdjustmentReason(e.target.value)}
                                placeholder="Reason for credit adjustment..."
                                className="bg-gray-800/50 border-white/10 text-white"
                            />
                        </div>

                        {balanceAdjustment && (
                            <div className="p-3 bg-gray-800/50 rounded-lg">
                                <p className="text-sm text-gray-400">Preview:</p>
                                <p className="text-lg font-medium text-white">
                                    {selectedWallet && formatNumber(selectedWallet.credits_balance)} {'→'} {selectedWallet && formatNumber(
                                        adjustmentType === 'add'
                                            ? selectedWallet.credits_balance + parseFloat(balanceAdjustment || '0')
                                            : selectedWallet.credits_balance - parseFloat(balanceAdjustment || '0')
                                    )} credits
                                </p>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowBalanceDialog(false)}
                            className="border-white/10 text-white hover:bg-white/5"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleBalanceAdjustment}
                            disabled={adjusting || !balanceAdjustment || !adjustmentReason}
                            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500"
                        >
                            {adjusting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {adjustmentType === 'add' ? 'Add Credits' : 'Subtract Credits'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}