"use client"

import { useEffect, useState, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Wallet,
    DollarSign,
    TrendingUp,
    Users,
    Search,
    Edit,
    Plus,
    Minus,
    Loader2,
    Sparkles,
    CreditCard,
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

interface TeamWallet {
    id: string
    team_id: string
    team_name: string
    team_description?: string
    balance: number
    currency: string
    created_at: string
    updated_at: string
    owner: {
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
    wallet_id: string
    user_id: string
    amount: number
    type: string
    description: string
    balance_before: number
    balance_after: number
    created_at: string
    user: {
        email: string
        full_name?: string
    }
}

interface WalletStats {
    totalUsers: number
    totalBalance: number
    averageBalance: number
    activeWallets: number
}

export default function AdminWalletsPage() {
  usePageTitle('Wallet Management')
    const [wallets, setWallets] = useState<TeamWallet[]>([])
    const [loading, setLoading] = useState(true)
    const [stats, setStats] = useState<WalletStats>({ totalUsers: 0, totalBalance: 0, averageBalance: 0, activeWallets: 0 })
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedWallet, setSelectedWallet] = useState<TeamWallet | null>(null)
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
        totalBalance: 0,
        averageBalance: 0,
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
            totalBalance: stats.totalBalance,
            averageBalance: stats.averageBalance,
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
                totalBalance: Math.floor(targetStats.totalBalance * progress),
                averageBalance: Math.floor(targetStats.averageBalance * progress),
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
            const response = await fetch('/api/admin/wallets')
            if (response.ok) {
                const data = await response.json()
                setWallets(data.wallets || [])
                setStats(data.stats || { totalUsers: 0, totalBalance: 0, averageBalance: 0, activeWallets: 0 })
            } else {
                toast.error('Failed to load wallets')
            }
        } catch (error) {
            console.error('Error loading wallets:', error)
            toast.error('Failed to load wallets')
        } finally {
            setLoading(false)
        }
    }

    const loadTransactions = async () => {
        try {
            setTransactionsLoading(true)
            const response = await fetch('/api/admin/transactions')
            if (response.ok) {
                const data = await response.json()
                setTransactions(data.transactions || [])
            } else {
                toast.error('Failed to load transactions')
            }
        } catch (error) {
            console.error('Error loading transactions:', error)
            toast.error('Failed to load transactions')
        } finally {
            setTransactionsLoading(false)
        }
    }

    const filteredWallets = wallets.filter(wallet =>
        wallet.team_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (wallet.team_description && wallet.team_description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (wallet.owner && wallet.owner.email && wallet.owner.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (wallet.owner && wallet.owner.full_name && wallet.owner.full_name.toLowerCase().includes(searchQuery.toLowerCase()))
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
            const response = await fetch(`/api/admin/wallets/${selectedWallet.id}/adjust`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: adjustmentType === 'add' ? amount : -amount,
                    reason: adjustmentReason,
                    type: 'admin_adjustment'
                })
            })

            if (response.ok) {
                toast.success(`Balance ${adjustmentType === 'add' ? 'increased' : 'decreased'} by $${amount.toFixed(2)}`)
                setShowBalanceDialog(false)
                setBalanceAdjustment('')
                setAdjustmentReason('')
                setSelectedWallet(null)
                await loadWallets()
            } else {
                const error = await response.json()
                toast.error(error.error || 'Failed to adjust balance')
            }
        } catch (error) {
            console.error('Error adjusting balance:', error)
            toast.error('Failed to adjust balance')
        } finally {
            setAdjusting(false)
        }
    }

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount)
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
            title: "Total Balance",
            value: formatCurrency(animatedStats.totalBalance),
            change: 0,
            icon: DollarSign,
            color: "from-green-500 to-emerald-500",
            bgColor: "from-green-500/10 to-emerald-500/10"
        },
        {
            title: "Average Balance",
            value: formatCurrency(animatedStats.averageBalance),
            change: 0,
            icon: TrendingUp,
            color: "from-purple-500 to-pink-500",
            bgColor: "from-purple-500/10 to-pink-500/10"
        },
        {
            title: "Active Wallets",
            value: animatedStats.activeWallets,
            change: 0,
            icon: Wallet,
            color: "from-orange-500 to-red-500",
            bgColor: "from-orange-500/10 to-red-500/10"
        }
    ]

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-white" />
                    <p className="text-gray-400">Loading wallets...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white">API Wallets</h1>
                    <p className="text-gray-400">Manage user API wallet balances and transactions</p>
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
                        Team Wallets
                    </TabsTrigger>
                    <TabsTrigger value="transactions" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600/20 data-[state=active]:to-pink-600/20 data-[state=active]:text-white">
                        Recent Transactions
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="wallets" className="space-y-4">
                    {/* Search */}
                    <div className="flex items-center gap-4">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                                placeholder="Search teams by name, description, or owner..."
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
                                <Wallet className="mx-auto h-12 w-12 mb-4 opacity-20 text-gray-600" />
                                <p className="text-gray-400 mb-4">
                                    {searchQuery ? 'No wallets found matching your search' : 'No team wallets found'}
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
                                                    <AvatarImage src={wallet.owner?.avatar_url} />
                                                    <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white">
                                                        {wallet.team_name.charAt(0).toUpperCase()}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <h3 className="text-lg font-semibold text-white">
                                                        {wallet.team_name}
                                                    </h3>
                                                    <p className="text-sm text-gray-400">{wallet.team_description || 'No description'}</p>
                                                    <p className="text-xs text-gray-500">Owner: {wallet.owner?.email || 'Unknown'}</p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <Badge variant="outline" className="border-green-500/30 text-green-400">
                                                            {formatCurrency(wallet.balance)}
                                                        </Badge>
                                                        <Badge variant="outline" className="border-blue-500/30 text-blue-400">
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
                                                    Adjust Balance
                                                </Button>
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
                                                                    {transaction.amount > 0 ? '+' : ''}{formatCurrency(transaction.amount)}
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
                            <CardTitle className="text-white">Recent Transactions</CardTitle>
                            <CardDescription className="text-gray-400">
                                All wallet transactions across the platform
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
                                    <CreditCard className="mx-auto h-12 w-12 mb-4 opacity-20 text-gray-600" />
                                    <p className="text-gray-400">No transactions found</p>
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
                                                        transaction.type === 'topup' ? 'bg-green-500/10' :
                                                        transaction.type === 'usage' ? 'bg-red-500/10' :
                                                        transaction.type === 'bonus' ? 'bg-blue-500/10' :
                                                        transaction.type === 'refund' ? 'bg-yellow-500/10' :
                                                        'bg-purple-500/10'
                                                    }`}>
                                                        {transaction.type === 'topup' ? <ArrowUp className="h-4 w-4 text-green-400" /> :
                                                         transaction.type === 'usage' ? <ArrowDown className="h-4 w-4 text-red-400" /> :
                                                         transaction.type === 'bonus' ? <Sparkles className="h-4 w-4 text-blue-400" /> :
                                                         transaction.type === 'refund' ? <CreditCard className="h-4 w-4 text-yellow-400" /> :
                                                         <Edit className="h-4 w-4 text-purple-400" />}
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
                                                        {transaction.amount > 0 ? '+' : ''}{formatCurrency(transaction.amount)}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        Balance: {formatCurrency(transaction.balance_after)}
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
                        <DialogTitle className="text-white">Adjust Wallet Balance</DialogTitle>
                        <DialogDescription className="text-gray-400">
                            {selectedWallet && `Adjusting balance for ${selectedWallet.team_name}`}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        {selectedWallet && (
                            <div className="p-4 bg-gray-800/50 rounded-lg">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-gray-400">Current Balance</p>
                                        <p className="text-2xl font-bold text-white">{formatCurrency(selectedWallet.balance)}</p>
                                    </div>
                                    <Avatar className="h-12 w-12">
                                        <AvatarImage src={selectedWallet.owner?.avatar_url} />
                                        <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white">
                                            {selectedWallet.team_name.charAt(0).toUpperCase()}
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
                                <Label htmlFor="amount" className="text-white">Amount ($)</Label>
                                <Input
                                    id="amount"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={balanceAdjustment}
                                    onChange={(e) => setBalanceAdjustment(e.target.value)}
                                    placeholder="0.00"
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
                                placeholder="Reason for balance adjustment..."
                                className="bg-gray-800/50 border-white/10 text-white"
                            />
                        </div>

                        {balanceAdjustment && (
                            <div className="p-3 bg-gray-800/50 rounded-lg">
                                <p className="text-sm text-gray-400">Preview:</p>
                                <p className="text-lg font-medium text-white">
                                    {selectedWallet && formatCurrency(selectedWallet.balance)} {'→'} {selectedWallet && formatCurrency(
                                        adjustmentType === 'add'
                                            ? selectedWallet.balance + parseFloat(balanceAdjustment || '0')
                                            : selectedWallet.balance - parseFloat(balanceAdjustment || '0')
                                    )}
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