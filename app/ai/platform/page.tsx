"use client"

import { useEffect, useState, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
    Users,
    Wallet,
    Key,
    Plus,
    ArrowUp,
    Loader2,
    CreditCard,
    Activity,
    Check
} from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import Link from "next/link"
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

interface TeamStats {
    apiRequests: number
    totalSpent: number
    apiKeys: number
    activeKeys: number
}

export default function AIPlatformDashboard() {
  usePageTitle('AI Platform')
    const supabase = createClient()
    const [teams, setTeams] = useState<Team[]>([])
    const [currentTeam, setCurrentTeam] = useState<Team | null>(null)
    const [loading, setLoading] = useState(true)
    const [creating, setCreating] = useState(false)
    const [showCreateDialog, setShowCreateDialog] = useState(false)
    const [showTopUpDialog, setShowTopUpDialog] = useState(false)
    const [topUpAmount, setTopUpAmount] = useState('10')

    // Form states
    const [teamName, setTeamName] = useState('')
    const [teamDescription, setTeamDescription] = useState('')

    // Stats
    const [animatedStats, setAnimatedStats] = useState({
        balance: 0,
        apiRequests: 0,
        totalSpent: 0,
        apiKeys: 0
    })

    const [realStats, setRealStats] = useState<TeamStats>({
        apiRequests: 0,
        totalSpent: 0,
        apiKeys: 0,
        activeKeys: 0
    })

    const initialAnimationDone = useRef(false)

    useEffect(() => {
        loadTeams()
    }, [])

    useEffect(() => {
        if (!currentTeam) return

        const interval = setInterval(() => {
            silentRefresh()
        }, 5000)

        return () => clearInterval(interval)
    }, [currentTeam])

    // Animate numbers
    useEffect(() => {
        if (!currentTeam) return

        const targetStats = {
            balance: currentTeam.wallet?.balance || 0,
            apiRequests: realStats.apiRequests,
            totalSpent: realStats.totalSpent,
            apiKeys: realStats.apiKeys
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
                balance: targetStats.balance * progress,
                apiRequests: Math.floor(targetStats.apiRequests * progress),
                totalSpent: targetStats.totalSpent * progress,
                apiKeys: Math.floor(targetStats.apiKeys * progress)
            })

            if (step >= steps) {
                clearInterval(timer)
                setAnimatedStats(targetStats)
                initialAnimationDone.current = true
            }
        }, interval)

        return () => clearInterval(timer)
    }, [currentTeam, realStats])

    async function loadTeams() {
        try {
            setLoading(true)
            const { data: { user } } = await supabase.auth.getUser()

            if (!user) {
                toast.error('Please sign in to continue')
                return
            }

            const { data: teamsData, error } = await supabase
                .from('ai_platform_teams')
                .select(`
                    *,
                    wallet:ai_wallets(balance, currency)
                `)
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })

            if (error) throw error

            setTeams(teamsData || [])

            // Auto-select first team or default team
            const storedTeamId = localStorage.getItem('current_ai_team_id')
            let selectedTeam = null

            if (storedTeamId) {
                selectedTeam = teamsData?.find(t => t.id === storedTeamId)
            }

            if (!selectedTeam && teamsData && teamsData.length > 0) {
                selectedTeam = teamsData.find(t => t.is_default) || teamsData[0]
            }

            if (selectedTeam) {
                await switchTeam(selectedTeam)
            }
        } catch (error) {
            console.error('Error loading teams:', error)
            toast.error('Failed to load teams')
        } finally {
            setLoading(false)
        }
    }

    async function switchTeam(team: Team) {
        setCurrentTeam(team)
        localStorage.setItem('current_ai_team_id', team.id)
        await loadTeamStats(team)
        initialAnimationDone.current = false
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

    async function silentRefresh() {
        if (!currentTeam) return
        try {
            const { data: teamData, error } = await supabase
                .from('ai_platform_teams')
                .select(`
                    *,
                    wallet:ai_wallets(balance, currency)
                `)
                .eq('id', currentTeam.id)
                .single()

            if (error) throw error

            if (teamData) {
                setCurrentTeam(teamData)
                setTeams(prev => prev.map(t => t.id === teamData.id ? teamData : t))
                await loadTeamStats(teamData)
            }
        } catch (error) {
            console.error('Silent refresh error:', error)
        }
    }

    async function createTeam() {
        if (!teamName || teamName.trim().length === 0) {
            toast.error('Please enter a team name')
            return
        }

        if (teams.length >= 3) {
            toast.error('Maximum 3 teams allowed')
            return
        }

        try {
            setCreating(true)
            const { data: { user } } = await supabase.auth.getUser()

            if (!user) {
                toast.error('Please sign in to continue')
                return
            }

            const { data, error } = await supabase
                .from('ai_platform_teams')
                .insert({
                    user_id: user.id,
                    name: teamName.trim(),
                    description: teamDescription.trim() || null,
                    is_default: teams.length === 0
                })
                .select(`
                    *,
                    wallet:ai_wallets(balance, currency)
                `)
                .single()

            if (error) throw error

            toast.success(`Team "${teamName}" created successfully!`)
            setTeamName('')
            setTeamDescription('')
            setShowCreateDialog(false)
            await loadTeams()

            if (data) {
                await switchTeam(data)
            }
        } catch (error: any) {
            console.error('Error creating team:', error)
            if (error.message?.includes('Maximum 3 teams')) {
                toast.error('Maximum 3 teams allowed per user')
            } else {
                toast.error('Failed to create team')
            }
        } finally {
            setCreating(false)
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
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
            </div>
        )
    }

    // No teams - show creation form
    if (teams.length === 0) {
        return (
            <div className="p-8 flex items-center justify-center min-h-screen animate-in fade-in slide-in-from-bottom-4 duration-500">
                <Card className="bg-gray-900/50 backdrop-blur-xl border-white/5 max-w-2xl w-full">
                    <CardHeader className="text-center pb-4">
                        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20">
                            <Users className="h-10 w-10 text-purple-400" />
                        </div>
                        <CardTitle className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                            Create Your First Team
                        </CardTitle>
                        <CardDescription className="text-gray-400 mt-2">
                            Teams help you organize your AI API usage with separate wallets and activity tracking
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="team-name" className="text-white">Team Name</Label>
                                <Input
                                    id="team-name"
                                    value={teamName}
                                    onChange={(e) => setTeamName(e.target.value)}
                                    placeholder="e.g., Production, Development, Testing"
                                    className="bg-gray-800/50 border-white/10 text-white"
                                    maxLength={50}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="team-description" className="text-white">Description (Optional)</Label>
                                <Textarea
                                    id="team-description"
                                    value={teamDescription}
                                    onChange={(e) => setTeamDescription(e.target.value)}
                                    placeholder="Describe what this team is for..."
                                    className="bg-gray-800/50 border-white/10 text-white resize-none"
                                    rows={3}
                                    maxLength={200}
                                />
                            </div>
                        </div>

                        <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-4">
                            <h4 className="text-white font-medium mb-2">What you get:</h4>
                            <ul className="space-y-1 text-sm text-gray-400">
                                <li className="flex items-center gap-2">
                                    <Check className="h-4 w-4 text-purple-400" />
                                    Separate wallet for each team
                                </li>
                                <li className="flex items-center gap-2">
                                    <Check className="h-4 w-4 text-purple-400" />
                                    Individual usage tracking
                                </li>
                                <li className="flex items-center gap-2">
                                    <Check className="h-4 w-4 text-purple-400" />
                                    Team-specific API keys
                                </li>
                                <li className="flex items-center gap-2">
                                    <Check className="h-4 w-4 text-purple-400" />
                                    Up to 3 teams per account
                                </li>
                            </ul>
                        </div>

                        <Button
                            onClick={createTeam}
                            disabled={creating || !teamName}
                            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500"
                        >
                            {creating ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Creating Team...
                                </>
                            ) : (
                                <>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Create Team
                                </>
                            )}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    // Has teams - show dashboard
    return (
        <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex flex-col gap-4">
                <div>
                    <h1 className="text-4xl font-bold text-white mb-2">Dashboard</h1>
                    <p className="text-gray-400">Manage your teams, wallets, and API usage</p>
                </div>
            </div>

            {!currentTeam ? (
                <div className="flex items-center justify-center h-64">
                    <p className="text-gray-400">Select a team to view details</p>
                </div>
            ) : (
                <>
                    {/* Stats Cards */}
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <Card className="bg-gradient-to-br from-purple-900/20 to-purple-700/10 border-purple-500/20 backdrop-blur-xl">
                            <CardContent className="p-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-purple-200">Wallet Balance</p>
                                        <h3 className="text-3xl font-bold text-white mt-1">
                                            {formatCurrency(animatedStats.balance)}
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
                                    Top Up
                                </Button>
                            </CardContent>
                        </Card>

                        <Card className="bg-gradient-to-br from-blue-900/20 to-blue-700/10 border-blue-500/20 backdrop-blur-xl">
                            <CardContent className="p-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-blue-200">API Requests</p>
                                        <h3 className="text-3xl font-bold text-white mt-1">
                                            {animatedStats.apiRequests.toLocaleString()}
                                        </h3>
                                    </div>
                                    <div className="p-3 bg-blue-500/20 rounded-lg">
                                        <Activity className="h-6 w-6 text-blue-400" />
                                    </div>
                                </div>
                                <p className="text-xs text-blue-200/60 mt-2">Total requests made</p>
                            </CardContent>
                        </Card>

                        <Card className="bg-gradient-to-br from-pink-900/20 to-pink-700/10 border-pink-500/20 backdrop-blur-xl">
                            <CardContent className="p-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-pink-200">Total Spent</p>
                                        <h3 className="text-3xl font-bold text-white mt-1">
                                            {formatCurrency(animatedStats.totalSpent)}
                                        </h3>
                                    </div>
                                    <div className="p-3 bg-pink-500/20 rounded-lg">
                                        <ArrowUp className="h-6 w-6 text-pink-400" />
                                    </div>
                                </div>
                                <p className="text-xs text-pink-200/60 mt-2">Lifetime spending</p>
                            </CardContent>
                        </Card>

                        <Card className="bg-gradient-to-br from-green-900/20 to-green-700/10 border-green-500/20 backdrop-blur-xl">
                            <CardContent className="p-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-green-200">API Keys</p>
                                        <h3 className="text-3xl font-bold text-white mt-1">
                                            {animatedStats.apiKeys}
                                        </h3>
                                    </div>
                                    <div className="p-3 bg-green-500/20 rounded-lg">
                                        <Key className="h-6 w-6 text-green-400" />
                                    </div>
                                </div>
                                <p className="text-xs text-green-200/60 mt-2">{realStats.activeKeys} active</p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Team Info Card */}
                    <Card className="bg-gray-900/50 backdrop-blur-xl border-white/5">
                        <CardHeader>
                            <CardTitle className="text-white">Team Information</CardTitle>
                            <CardDescription className="text-gray-400">
                                Details about {currentTeam.name}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm text-gray-400">Team Name</p>
                                    <p className="text-white font-medium">{currentTeam.name}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-400">Created</p>
                                    <p className="text-white font-medium">{formatDate(currentTeam.created_at)}</p>
                                </div>
                                {currentTeam.description && (
                                    <div className="col-span-2">
                                        <p className="text-sm text-gray-400">Description</p>
                                        <p className="text-white">{currentTeam.description}</p>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-2 pt-4">
                                <Link href="/ai/platform/keys" className="flex-1">
                                    <Button className="w-full bg-purple-600 hover:bg-purple-500">
                                        <Key className="mr-2 h-4 w-4" />
                                        Manage API Keys
                                    </Button>
                                </Link>
                                <Link href="/ai/platform/wallet" className="flex-1">
                                    <Button variant="outline" className="w-full border-white/10 text-white hover:bg-white/5">
                                        <Wallet className="mr-2 h-4 w-4" />
                                        View Transactions
                                    </Button>
                                </Link>
                            </div>
                        </CardContent>
                    </Card>
                </>
            )}

            {/* Create Team Dialog */}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent className="bg-gray-900 border-white/10">
                    <DialogHeader>
                        <DialogTitle className="text-white">Create New Team</DialogTitle>
                        <DialogDescription className="text-gray-400">
                            You can create up to 3 teams. Each team has its own wallet and activity.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="new-team-name" className="text-white">Team Name</Label>
                            <Input
                                id="new-team-name"
                                value={teamName}
                                onChange={(e) => setTeamName(e.target.value)}
                                placeholder="e.g., Production, Development"
                                className="bg-gray-800/50 border-white/10 text-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="new-team-description" className="text-white">Description</Label>
                            <Textarea
                                id="new-team-description"
                                value={teamDescription}
                                onChange={(e) => setTeamDescription(e.target.value)}
                                placeholder="Optional description..."
                                className="bg-gray-800/50 border-white/10 text-white resize-none"
                                rows={3}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            onClick={createTeam}
                            disabled={creating || !teamName}
                            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500"
                        >
                            {creating ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                <>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Create Team
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
