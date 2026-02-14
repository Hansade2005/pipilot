"use client"

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    ArrowLeft,
    Wallet,
    CreditCard,
    CheckCircle,
    XCircle,
    DollarSign,
    TrendingUp,
    Calendar,
    Receipt,
    Loader2
} from 'lucide-react'
import { toast } from 'sonner'
import { usePageTitle } from '@/hooks/use-page-title'

interface Transaction {
    id: string
    amount: number
    description: string
    type: 'credit' | 'debit'
    created_at: string
    balance_before: number
    balance_after: number
}

interface WalletInfo {
    balance: number
    currency: string
    transactions: Transaction[]
}

function WalletPageContent() {
    const supabase = createClient()
    const router = useRouter()
    const searchParams = useSearchParams()
    const success = searchParams?.get('success')
    const canceled = searchParams?.get('canceled')

    const [wallet, setWallet] = useState<WalletInfo | null>(null)
    const [loading, setLoading] = useState(true)
    const [user, setUser] = useState<any>(null)

    useEffect(() => {
        checkAuthAndLoadWallet()
    }, [])

    useEffect(() => {
        if (success === 'true') {
            toast.success('Payment successful! Your wallet has been credited.')
            // Clean up URL
            router.replace('/ai-api/wallet')
        } else if (canceled === 'true') {
            toast.error('Payment was canceled.')
            // Clean up URL
            router.replace('/ai-api/wallet')
        }
    }, [success, canceled, router])

    const checkAuthAndLoadWallet = async () => {
        try {
            const { data: { user }, error } = await supabase.auth.getUser()

            if (error || !user) {
                router.push('/auth/login')
                return
            }

            setUser(user)
            await loadWallet()
        } catch (error) {
            console.error('Auth check error:', error)
            router.push('/auth/login')
        }
    }

    const loadWallet = async () => {
        try {
            setLoading(true)
            const response = await fetch('/api/ai-api/wallet')

            if (!response.ok) {
                throw new Error('Failed to load wallet')
            }

            const data = await response.json()

            // Transform API response to match component expectations
            setWallet({
                balance: data.wallet.balance,
                currency: data.wallet.currency,
                transactions: data.transactions || []
            })
        } catch (error) {
            console.error('Error loading wallet:', error)
            toast.error('Failed to load wallet information')
        } finally {
            setLoading(false)
        }
    }

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2
        }).format(amount)
    }

    const formatDate = (date: string) => {
        return new Date(date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    const getTransactionIcon = (type: string) => {
        switch (type) {
            case 'credit':
                return <TrendingUp className="h-4 w-4 text-green-500" />
            case 'debit':
                return <Receipt className="h-4 w-4 text-red-500" />
            default:
                return <Receipt className="h-4 w-4 text-gray-500" />
        }
    }

    const getStatusBadge = (type: string) => {
        switch (type) {
            case 'credit':
                return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Credit</Badge>
            case 'debit':
                return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Debit</Badge>
            default:
                return <Badge variant="secondary">{type}</Badge>
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
            {/* Background pattern */}
            <div className="absolute inset-0 opacity-30">
                <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-pink-500/5"></div>
            </div>

            <div className="relative z-10 p-8">
                <div className="max-w-6xl mx-auto space-y-8">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <Link href="/ai/platform">
                                <Button variant="ghost" size="sm" className="text-white hover:bg-white/10">
                                    <ArrowLeft className="mr-2 h-4 w-4" />
                                    Back to Platform
                                </Button>
                            </Link>
                            <div>
                                <h1 className="text-3xl font-bold text-white">Wallet</h1>
                                <p className="text-gray-400">Manage your credits and view transaction history</p>
                            </div>
                        </div>
                    </div>

                    {/* Balance Card */}
                    <Card className="bg-gradient-to-br from-purple-900/20 to-purple-700/10 border-purple-500/20 backdrop-blur-xl">
                        <CardContent className="p-8">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-purple-200 mb-2">Current Balance</p>
                                    <h2 className="text-4xl font-bold text-white mb-2">
                                        {wallet ? formatCurrency(wallet.balance) : '$0.00'}
                                    </h2>
                                    <p className="text-purple-200/60">
                                        {wallet?.currency || 'USD'} credits available
                                    </p>
                                </div>
                                <div className="flex items-center space-x-4">
                                    <div className="p-4 bg-purple-500/20 rounded-full">
                                        <Wallet className="h-8 w-8 text-purple-400" />
                                    </div>
                                    <Link href="/ai/platform">
                                        <Button className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500">
                                            <CreditCard className="mr-2 h-4 w-4" />
                                            Add Credits
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Transactions */}
                    <Card className="bg-gray-900/50 backdrop-blur-xl border-white/5">
                        <CardHeader>
                            <CardTitle className="text-white">Transaction History</CardTitle>
                            <CardDescription className="text-gray-400">
                                Your recent wallet transactions
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {wallet?.transactions && wallet.transactions.length > 0 ? (
                                <div className="space-y-4">
                                    {wallet.transactions.map((transaction) => (
                                        <div key={transaction.id} className="flex items-center justify-between p-4 bg-gray-800/30 rounded-lg border border-white/5">
                                            <div className="flex items-center space-x-3">
                                                {getTransactionIcon(transaction.type)}
                                                <div>
                                                    <p className="text-white font-medium">{transaction.description}</p>
                                                    <p className="text-gray-400 text-sm flex items-center">
                                                        <Calendar className="mr-1 h-3 w-3" />
                                                        {formatDate(transaction.created_at)}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center space-x-3">
                                                {getStatusBadge(transaction.type)}
                                                <div className="text-right">
                                                    <p className={`font-medium ${transaction.type === 'credit' ? 'text-green-400' : 'text-red-400'}`}>
                                                        {transaction.type === 'credit' ? '+' : '-'}{formatCurrency(Math.abs(transaction.amount))}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-12">
                                    <Receipt className="mx-auto h-12 w-12 text-gray-600 opacity-20 mb-4" />
                                    <p className="text-gray-400">No transactions yet</p>
                                    <p className="text-gray-500 text-sm mt-2">Your transaction history will appear here</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}

export default function WalletPage() {
  usePageTitle('AI API Wallet')
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
            </div>
        }>
            <WalletPageContent />
        </Suspense>
    )
}