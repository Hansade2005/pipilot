"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import {
    Users,
    Wallet,
    Key,
    Plus,
    ArrowUp,
    Loader2,
    CreditCard,
    Activity,
    ChevronDown,
    ArrowDown,
    Check,
    Trash2,
    Copy,
    RefreshCw,
    ExternalLink,
    Sparkles
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Logo } from "@/components/ui/logo"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import type { User } from "@supabase/supabase-js"

interface AIPplatformTabProps {
    user: User
}

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

interface ApiKey {
    id: string
    name: string
    key_prefix: string
    created_at: string
    last_used?: string
    is_active: boolean
    rate_limit_per_minute?: number
    rate_limit_per_day?: number
    expires_at?: string
}

interface Transaction {
    id: string
    amount: number
    type: 'credit' | 'debit'
    description: string
    created_at: string
    status: 'completed' | 'pending' | 'failed'
}

interface TeamActivity {
    id: string
    action_type: string
    description: string
    metadata: any
    created_at: string
}

interface TeamStats {
    apiRequests: number
    totalSpent: number
    apiKeys: number
    activeKeys: number
}

export function AIPplatformTab({ user }: AIPplatformTabProps) {
    const router = useRouter()
    const supabase = createClient()
    const [activeSection, setActiveSection] = useState<"overview" | "api-keys" | "wallet" | "teams" | "activity">("overview")

    // Team state
    const [teams, setTeams] = useState<Team[]>([])
    const [currentTeam, setCurrentTeam] = useState<Team | null>(null)
    const [loadingTeams, setLoadingTeams] = useState(false)

    // API Keys state
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
    const [newKeyName, setNewKeyName] = useState("")
    const [showNewKey, setShowNewKey] = useState(false)
    const [generatedKey, setGeneratedKey] = useState<string | null>(null)
    const [loadingKeys, setLoadingKeys] = useState(false)

    // Wallet state
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [topUpAmount, setTopUpAmount] = useState("")
    const [processingTopUp, setProcessingTopUp] = useState(false)
    const [loadingWallet, setLoadingWallet] = useState(false)

    // Teams state
    const [newTeamName, setNewTeamName] = useState("")
    const [newTeamDescription, setNewTeamDescription] = useState("")
    const [showCreateTeamDialog, setShowCreateTeamDialog] = useState(false)
    const [creatingTeam, setCreatingTeam] = useState(false)

    // Activity state
    const [activityLogs, setActivityLogs] = useState<TeamActivity[]>([])
    const [loadingActivity, setLoadingActivity] = useState(false)

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

    // Load data on mount and when section changes
    useEffect(() => {
        loadTeams()
    }, [])

    useEffect(() => {
        if (activeSection === "api-keys" && currentTeam) loadApiKeys()
        if (activeSection === "wallet" && currentTeam) loadWallet()
        if (activeSection === "teams") loadTeamsForTab()
        if (activeSection === "activity" && currentTeam) loadActivity()
    }, [activeSection, currentTeam])

    // Animate stats when they change
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
            setLoadingTeams(true)
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
            setLoadingTeams(false)
        }
    }

    async function loadTeamsForTab() {
        // Only reload teams if we don't have them yet or need to refresh
        if (teams.length === 0) {
            await loadTeams()
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

    async function loadApiKeys() {
        if (!currentTeam) return

        try {
            setLoadingKeys(true)
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return

            const response = await fetch('/api/ai-api/keys', {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                },
            })

            if (response.ok) {
                const data = await response.json()
                setApiKeys(data.keys || [])
            }
        } catch (error) {
            console.error('Error loading API keys:', error)
        } finally {
            setLoadingKeys(false)
        }
    }

    async function loadWallet() {
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

    async function loadActivity() {
        if (!currentTeam) return

        try {
            setLoadingActivity(true)
            const { data, error } = await supabase
                .from('ai_platform_activity')
                .select('*')
                .eq('team_id', currentTeam.id)
                .order('created_at', { ascending: false })
                .limit(50)

            if (error) throw error

            setActivityLogs(data || [])
        } catch (error) {
            console.error('Error loading activity:', error)
        } finally {
            setLoadingActivity(false)
        }
    }

    async function generateApiKey() {
        if (!newKeyName.trim()) return

        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return

            const response = await fetch('/api/ai-api/keys', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: newKeyName.trim(),
                }),
            })

            if (response.ok) {
                const data = await response.json()
                setGeneratedKey(data.apiKey)
                setNewKeyName("")
                setShowNewKey(false)
                loadApiKeys()
                toast.success('API key generated successfully!')
            } else {
                const error = await response.json()
                toast.error(error.error || 'Failed to generate API key')
            }
        } catch (error) {
            console.error('Error generating API key:', error)
            toast.error('Failed to generate API key')
        }
    }

    async function deleteApiKey(keyId: string) {
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return

            const response = await fetch('/api/ai-api/keys', {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    keyId,
                }),
            })

            if (response.ok) {
                loadApiKeys()
                toast.success('API key deactivated')
            } else {
                const error = await response.json()
                toast.error(error.error || 'Failed to deactivate API key')
            }
        } catch (error) {
            console.error('Error deactivating API key:', error)
            toast.error('Failed to deactivate API key')
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
            setProcessingTopUp(true)
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
        } finally {
            setProcessingTopUp(false)
        }
    }

    async function createTeam() {
        if (!newTeamName.trim()) {
            toast.error('Please enter a team name')
            return
        }

        if (teams.length >= 3) {
            toast.error('Maximum 3 teams allowed')
            return
        }

        try {
            setCreatingTeam(true)
            const { data, error } = await supabase
                .from('ai_platform_teams')
                .insert({
                    user_id: user.id,
                    name: newTeamName.trim(),
                    description: newTeamDescription.trim() || null,
                    is_default: teams.length === 0
                })
                .select(`
                    *,
                    wallet:ai_wallets(balance, currency)
                `)
                .single()

            if (error) throw error

            toast.success(`Team "${newTeamName}" created successfully!`)
            setNewTeamName('')
            setNewTeamDescription('')
            setShowCreateTeamDialog(false)

            // Add the new team to the local state instead of reloading
            if (data) {
                setTeams(prev => [data, ...prev])
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
            setCreatingTeam(false)
        }
    }

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text)
            toast.success('Copied to clipboard!')
        } catch (error) {
            toast.error('Failed to copy to clipboard')
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

    const getActivityIcon = (type: string) => {
        switch (type) {
            case 'api_request': return <Activity className="h-4 w-4" />
            case 'payment': return <CreditCard className="h-4 w-4" />
            case 'key_created': return <Key className="h-4 w-4" />
            case 'key_deleted': return <Trash2 className="h-4 w-4" />
            default: return <Activity className="h-4 w-4" />
        }
    }

    return (
        <div className="h-full flex flex-col bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
            {/* Header */}
            <div className="border-b border-white/10 bg-gray-900/95 backdrop-blur-xl p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center shadow-lg shadow-orange-500/20">
                          <Logo variant="icon" size="sm" />

                        </div>
                        <div>
                            
                            <p className="text-sm text-gray-400">
                                {currentTeam ? `Managing ${currentTeam.name}` : 'Select or create a team'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center space-x-2">
                        {currentTeam && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" className="border-white/10 text-white hover:bg-white/5">
                                        <Users className="w-4 h-4 mr-2" />
                                        {currentTeam.name}
                                        <ChevronDown className="w-4 h-4 ml-2" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="bg-gray-900 border-white/10">
                                    {teams.map((team) => (
                                        <DropdownMenuItem
                                            key={team.id}
                                            onClick={() => switchTeam(team)}
                                            className="text-white hover:bg-gray-700 focus:bg-gray-700"
                                        >
                                            <Users className="w-4 h-4 mr-2" />
                                            <div>
                                                <div className="font-medium">{team.name}</div>
                                                <div className="text-xs text-gray-400">
                                                    {formatCurrency(team.wallet?.balance || 0)}
                                                </div>
                                            </div>
                                            {currentTeam.id === team.id && <Check className="w-4 h-4 ml-auto" />}
                                        </DropdownMenuItem>
                                    ))}
                                    {teams.length < 3 && (
                                        <>
                                            <div className="border-t border-white/10 my-1" />
                                            <DropdownMenuItem
                                                onClick={() => setShowCreateTeamDialog(true)}
                                                className="text-orange-400 hover:bg-orange-500/10 focus:bg-orange-500/10"
                                            >
                                                <Plus className="w-4 h-4 mr-2" />
                                                Create New Team
                                            </DropdownMenuItem>
                                        </>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                        <Button
                            variant="outline"
                            className="border-white/10 text-white hover:bg-white/5"
                            onClick={() => router.push('/ai/platform')}
                        >
                            <ExternalLink className="w-4 h-4 mr-2" />
                        
                        </Button>
                    </div>
                </div>
            </div>

            {/* Content area with tabs */}
            <div className="flex-1 overflow-auto">
                <Tabs value={activeSection} onValueChange={(value) => setActiveSection(value as any)} className="h-full">
                    <div className="border-b border-white/10 bg-gray-900/50">
                        <TabsList className="grid w-full grid-cols-5 bg-transparent">
                            <TabsTrigger
                                value="overview"
                                className="data-[state=active]:bg-orange-600/20 data-[state=active]:text-white"
                            >
                                Overview
                            </TabsTrigger>
                            <TabsTrigger
                                value="api-keys"
                                className="data-[state=active]:bg-orange-600/20 data-[state=active]:text-white"
                            >
                                API Keys
                            </TabsTrigger>
                            <TabsTrigger
                                value="wallet"
                                className="data-[state=active]:bg-orange-600/20 data-[state=active]:text-white"
                            >
                                Wallet
                            </TabsTrigger>
                            <TabsTrigger
                                value="teams"
                                className="data-[state=active]:bg-orange-600/20 data-[state=active]:text-white"
                            >
                                Teams
                            </TabsTrigger>
                            <TabsTrigger
                                value="activity"
                                className="data-[state=active]:bg-orange-600/20 data-[state=active]:text-white"
                            >
                                Activity
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="p-6">
                        <TabsContent value="overview" className="space-y-6">
                            {loadingTeams ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
                                </div>
                            ) : teams.length === 0 ? (
                                <Card className="bg-gray-800/50 border-white/10">
                                    <CardHeader>
                                        <CardTitle className="text-white flex items-center">
                                            <Sparkles className="w-5 h-5 mr-2 text-orange-400" />
                                            Welcome to PiPilot AI
                                        </CardTitle>
                                        <CardDescription className="text-gray-400">
                                            Create your first team to get started with AI API management.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="first-team-name" className="text-white">Team Name</Label>
                                                <Input
                                                    id="first-team-name"
                                                    value={newTeamName}
                                                    onChange={(e) => setNewTeamName(e.target.value)}
                                                    placeholder="e.g., Production, Development"
                                                    className="bg-gray-700/50 border-white/10 text-white"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="first-team-description" className="text-white">Description (Optional)</Label>
                                                <Textarea
                                                    id="first-team-description"
                                                    value={newTeamDescription}
                                                    onChange={(e) => setNewTeamDescription(e.target.value)}
                                                    placeholder="Describe what this team is for..."
                                                    className="bg-gray-700/50 border-white/10 text-white resize-none"
                                                    rows={3}
                                                />
                                            </div>
                                            <Button
                                                onClick={createTeam}
                                                disabled={creatingTeam || !newTeamName.trim()}
                                                className="w-full bg-orange-600 hover:bg-orange-500"
                                            >
                                                {creatingTeam ? (
                                                    <>
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                        Creating Team...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Plus className="mr-2 h-4 w-4" />
                                                        Create Your First Team
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ) : currentTeam ? (
                                <>
                                    {/* Stats Cards */}
                                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                                        <Card className="bg-gradient-to-br from-orange-900/20 to-orange-700/10 border-orange-500/20 backdrop-blur-xl">
                                            <CardContent className="p-6">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="text-sm font-medium text-orange-200">Wallet Balance</p>
                                                        <h3 className="text-3xl font-bold text-white mt-1">
                                                            {formatCurrency(animatedStats.balance)}
                                                        </h3>
                                                    </div>
                                                    <div className="p-3 bg-orange-500/20 rounded-lg">
                                                        <Wallet className="h-6 w-6 text-orange-400" />
                                                    </div>
                                                </div>
                                                <Button
                                                    onClick={() => setActiveSection("wallet")}
                                                    size="sm"
                                                    className="mt-4 w-full bg-orange-600 hover:bg-orange-500"
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

                                        <Card className="bg-gradient-to-br from-orange-900/20 to-orange-700/10 border-orange-500/20 backdrop-blur-xl">
                                            <CardContent className="p-6">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="text-sm font-medium text-orange-200">Total Spent</p>
                                                        <h3 className="text-3xl font-bold text-white mt-1">
                                                            {formatCurrency(animatedStats.totalSpent)}
                                                        </h3>
                                                    </div>
                                                    <div className="p-3 bg-orange-500/20 rounded-lg">
                                                        <ArrowUp className="h-6 w-6 text-orange-400" />
                                                    </div>
                                                </div>
                                                <p className="text-xs text-orange-200/60 mt-2">Lifetime spending</p>
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

                                    {/* Quick Actions */}
                                    <Card className="bg-gray-800/50 border-white/10">
                                        <CardHeader>
                                            <CardTitle className="text-white">Quick Actions</CardTitle>
                                            <CardDescription className="text-gray-400">
                                                Common tasks for {currentTeam.name}
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <Button
                                                    variant="outline"
                                                    className="border-white/10 text-white hover:bg-white/5 justify-start h-auto p-4"
                                                    onClick={() => setActiveSection("api-keys")}
                                                >
                                                    <Key className="w-4 h-4 mr-3" />
                                                    <div className="text-left">
                                                        <div className="font-medium">Generate API Key</div>
                                                        <div className="text-xs text-gray-400">Create new API keys for your applications</div>
                                                    </div>
                                                </Button>

                                                <Button
                                                    variant="outline"
                                                    className="border-white/10 text-white hover:bg-white/5 justify-start h-auto p-4"
                                                    onClick={() => setActiveSection("wallet")}
                                                >
                                                    <Wallet className="w-4 h-4 mr-3" />
                                                    <div className="text-left">
                                                        <div className="font-medium">Top Up Credits</div>
                                                        <div className="text-xs text-gray-400">Add credits to your wallet</div>
                                                    </div>
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </>
                            ) : (
                                <div className="text-center py-8">
                                    <p className="text-gray-400">Select a team to view details</p>
                                </div>
                            )}
                        </TabsContent>

                        <TabsContent value="api-keys" className="space-y-6">
                            {!currentTeam ? (
                                <Card className="bg-gray-800/50 border-white/10">
                                    <CardContent className="pt-6 text-center">
                                        <p className="text-gray-400">Please select or create a team first</p>
                                    </CardContent>
                                </Card>
                            ) : (
                                <Card className="bg-gray-800/50 border-white/10">
                                    <CardHeader>
                                        <CardTitle className="text-white">API Keys</CardTitle>
                                        <CardDescription className="text-gray-400">
                                            Manage API keys for {currentTeam.name}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        {!showNewKey && (
                                            <Button
                                                onClick={() => setShowNewKey(true)}
                                                className="w-full"
                                            >
                                                <Plus className="w-4 h-4 mr-2" />
                                                Generate New API Key
                                            </Button>
                                        )}

                                        {showNewKey && (
                                            <Card className="bg-gray-700/50 border-white/5">
                                                <CardContent className="pt-6">
                                                    <div className="space-y-4">
                                                        <div>
                                                            <Label htmlFor="key-name" className="text-white">Key Name</Label>
                                                            <Input
                                                                id="key-name"
                                                                placeholder="My API Key"
                                                                value={newKeyName}
                                                                onChange={(e) => setNewKeyName(e.target.value)}
                                                                className="bg-gray-600/50 border-white/10 text-white"
                                                            />
                                                        </div>
                                                        <div className="flex space-x-2">
                                                            <Button onClick={generateApiKey} disabled={!newKeyName.trim()}>
                                                                Generate Key
                                                            </Button>
                                                            <Button variant="outline" onClick={() => setShowNewKey(false)}>
                                                                Cancel
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        )}

                                        {generatedKey && (
                                            <Card className="bg-green-900/20 border-green-500/30">
                                                <CardContent className="pt-6">
                                                    <div className="space-y-4">
                                                        <div className="flex items-center text-green-400">
                                                            <Sparkles className="w-4 h-4 mr-2" />
                                                            API Key Generated Successfully!
                                                        </div>
                                                        <div className="bg-gray-800 p-3 rounded font-mono text-sm text-white break-all">
                                                            {generatedKey}
                                                        </div>
                                                        <div className="flex space-x-2">
                                                            <Button size="sm" onClick={() => copyToClipboard(generatedKey)}>
                                                                <Copy className="w-4 h-4 mr-2" />
                                                                Copy Key
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => setGeneratedKey(null)}
                                                            >
                                                                Done
                                                            </Button>
                                                        </div>
                                                        <p className="text-xs text-yellow-400">
                                                            ⚠️ Save this key securely. You won't be able to see it again!
                                                        </p>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        )}

                                        <div className="space-y-2">
                                            <h3 className="text-white font-medium">Your API Keys</h3>
                                            {loadingKeys ? (
                                                <div className="text-center py-4">
                                                    <RefreshCw className="w-6 h-6 animate-spin text-gray-400 mx-auto" />
                                                </div>
                                            ) : apiKeys.length === 0 ? (
                                                <p className="text-gray-400 text-sm">No API keys yet. Generate your first key above.</p>
                                            ) : (
                                                apiKeys.map((key) => (
                                                    <Card key={key.id} className="bg-gray-700/50 border-white/5">
                                                        <CardContent className="pt-4">
                                                            <div className="flex items-center justify-between">
                                                                <div>
                                                                    <h4 className="text-white font-medium">{key.name}</h4>
                                                                    <p className="text-xs text-gray-400">
                                                                        {key.key_prefix}... • Created {formatDate(key.created_at)}
                                                                        {key.last_used && ` • Last used ${formatDate(key.last_used)}`}
                                                                    </p>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <Badge variant={key.is_active ? "default" : "secondary"} className={key.is_active ? "bg-green-500/20 text-green-400" : ""}>
                                                                        {key.is_active ? "Active" : "Inactive"}
                                                                    </Badge>
                                                                    {key.is_active && (
                                                                        <Button
                                                                            size="sm"
                                                                            variant="destructive"
                                                                            onClick={() => deleteApiKey(key.id)}
                                                                        >
                                                                            <Trash2 className="w-4 h-4" />
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </CardContent>
                                                    </Card>
                                                ))
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </TabsContent>

                        <TabsContent value="wallet" className="space-y-6">
                            {!currentTeam ? (
                                <Card className="bg-gray-800/50 border-white/10">
                                    <CardContent className="pt-6 text-center">
                                        <p className="text-gray-400">Please select or create a team first</p>
                                    </CardContent>
                                </Card>
                            ) : (
                                <>
                                    <Card className="bg-gray-800/50 border-white/10">
                                        <CardHeader>
                                            <CardTitle className="text-white">Wallet & Credits</CardTitle>
                                            <CardDescription className="text-gray-400">
                                                Manage credits for {currentTeam.name}. $1 = 1 credit.
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-6">
                                            <div className="text-center">
                                                <div className="text-3xl font-bold text-white">
                                                    {currentTeam?.wallet ? formatCurrency(currentTeam.wallet.balance) : '$0.00'}
                                                </div>
                                                <p className="text-gray-400">Available Credits</p>
                                            </div>

                                            <Card className="bg-gray-700/50 border-white/5">
                                                <CardHeader>
                                                    <CardTitle className="text-white text-lg">Top Up Credits</CardTitle>
                                                </CardHeader>
                                                <CardContent className="space-y-4">
                                                    <div>
                                                        <Label htmlFor="amount" className="text-white">Amount (USD)</Label>
                                                        <Input
                                                            id="amount"
                                                            type="number"
                                                            min="1"
                                                            max="1000"
                                                            placeholder="10.00"
                                                            value={topUpAmount}
                                                            onChange={(e) => setTopUpAmount(e.target.value)}
                                                            className="bg-gray-600/50 border-white/10 text-white"
                                                        />
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
                                                    <Button
                                                        onClick={handleTopUp}
                                                        disabled={processingTopUp || !topUpAmount}
                                                        className="w-full"
                                                    >
                                                        {processingTopUp ? (
                                                            <>
                                                                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                                                Processing...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <CreditCard className="w-4 h-4 mr-2" />
                                                                Add Credits
                                                            </>
                                                        )}
                                                    </Button>
                                                </CardContent>
                                            </Card>
                                        </CardContent>
                                    </Card>

                                    <Card className="bg-gray-800/50 border-white/10">
                                        <CardHeader>
                                            <CardTitle className="text-white">Recent Transactions</CardTitle>
                                            <CardDescription className="text-gray-400">
                                                Latest wallet activity
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            {loadingWallet ? (
                                                <div className="text-center py-8">
                                                    <RefreshCw className="w-8 h-8 animate-spin text-gray-400 mx-auto" />
                                                </div>
                                            ) : transactions.length === 0 ? (
                                                <p className="text-gray-400 text-center py-8">No transactions yet.</p>
                                            ) : (
                                                <div className="space-y-2">
                                                    {transactions.map((transaction) => (
                                                        <Card key={transaction.id} className="bg-gray-700/50 border-white/5">
                                                            <CardContent className="pt-4">
                                                                <div className="flex items-center justify-between">
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
                                                                            <p className="text-xs text-gray-400">{formatDate(transaction.created_at)}</p>
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
                                                            </CardContent>
                                                        </Card>
                                                    ))}
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                </>
                            )}
                        </TabsContent>

                        <TabsContent value="teams" className="space-y-6">
                            <Card className="bg-gray-800/50 border-white/10">
                                <CardHeader>
                                    <CardTitle className="text-white">Teams</CardTitle>
                                    <CardDescription className="text-gray-400">
                                        Create and manage teams for collaborative AI development.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {teams.length < 3 && (
                                        <Card className="bg-gray-700/50 border-white/5">
                                            <CardContent className="pt-6">
                                                <div className="space-y-4">
                                                    <div>
                                                        <Label htmlFor="team-name" className="text-white">Team Name</Label>
                                                        <Input
                                                            id="team-name"
                                                            placeholder="My Team"
                                                            value={newTeamName}
                                                            onChange={(e) => setNewTeamName(e.target.value)}
                                                            className="bg-gray-600/50 border-white/10 text-white"
                                                        />
                                                    </div>
                                                    <div>
                                                        <Label htmlFor="team-description" className="text-white">Description (Optional)</Label>
                                                        <Textarea
                                                            id="team-description"
                                                            placeholder="Team description..."
                                                            value={newTeamDescription}
                                                            onChange={(e) => setNewTeamDescription(e.target.value)}
                                                            className="bg-gray-600/50 border-white/10 text-white"
                                                        />
                                                    </div>
                                                    <Button onClick={createTeam} disabled={!newTeamName.trim() || creatingTeam}>
                                                        {creatingTeam ? (
                                                            <>
                                                                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                                                Creating...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Plus className="w-4 h-4 mr-2" />
                                                                Create Team
                                                            </>
                                                        )}
                                                    </Button>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )}

                                    <div className="space-y-2">
                                        <h3 className="text-white font-medium">Your Teams</h3>
                                        {loadingTeams ? (
                                            <div className="text-center py-4">
                                                <RefreshCw className="w-6 h-6 animate-spin text-gray-400 mx-auto" />
                                            </div>
                                        ) : teams.length === 0 ? (
                                            <p className="text-gray-400 text-sm">No teams yet. Create your first team above.</p>
                                        ) : (
                                            teams.map((team) => (
                                                <Card key={team.id} className="bg-gray-700/50 border-white/5">
                                                    <CardContent className="pt-4">
                                                        <div className="flex items-center justify-between">
                                                            <div>
                                                                <h4 className="text-white font-medium">{team.name}</h4>
                                                                <p className="text-xs text-gray-400">
                                                                    Balance: {formatCurrency(team.wallet?.balance || 0)}
                                                                </p>
                                                                {team.description && (
                                                                    <p className="text-xs text-gray-400 mt-1">{team.description}</p>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                {team.is_default && (
                                                                    <Badge variant="secondary">Default</Badge>
                                                                )}
                                                                {currentTeam?.id === team.id && (
                                                                    <Badge variant="default">Active</Badge>
                                                                )}
                                                                {currentTeam?.id !== team.id && (
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        onClick={() => switchTeam(team)}
                                                                        className="border-white/10 text-white hover:bg-white/5"
                                                                    >
                                                                        Switch
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            ))
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="activity" className="space-y-6">
                            {!currentTeam ? (
                                <Card className="bg-gray-800/50 border-white/10">
                                    <CardContent className="pt-6 text-center">
                                        <p className="text-gray-400">Please select or create a team first</p>
                                    </CardContent>
                                </Card>
                            ) : (
                                <Card className="bg-gray-800/50 border-white/10">
                                    <CardHeader>
                                        <CardTitle className="text-white">Activity Logs</CardTitle>
                                        <CardDescription className="text-gray-400">
                                            View recent platform activity for {currentTeam.name}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        {loadingActivity ? (
                                            <div className="text-center py-8">
                                                <RefreshCw className="w-8 h-8 animate-spin text-gray-400 mx-auto" />
                                            </div>
                                        ) : activityLogs.length === 0 ? (
                                            <p className="text-gray-400 text-center py-8">No activity logs yet.</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {activityLogs.map((log) => (
                                                    <Card key={log.id} className="bg-gray-700/50 border-white/5">
                                                        <CardContent className="pt-4">
                                                            <div className="flex items-start gap-3">
                                                                <div className="p-2 bg-orange-500/20 rounded-lg">
                                                                    {getActivityIcon(log.action_type)}
                                                                </div>
                                                                <div className="flex-1">
                                                                    <p className="text-white text-sm">{log.description}</p>
                                                                    <p className="text-gray-400 text-xs mt-1">{formatDate(log.created_at)}</p>
                                                                </div>
                                                            </div>
                                                        </CardContent>
                                                    </Card>
                                                ))}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            )}
                        </TabsContent>
                    </div>
                </Tabs>
            </div>

            {/* Create Team Dialog */}
            <Dialog open={showCreateTeamDialog} onOpenChange={setShowCreateTeamDialog}>
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
                                value={newTeamName}
                                onChange={(e) => setNewTeamName(e.target.value)}
                                placeholder="e.g., Production, Development"
                                className="bg-gray-800/50 border-white/10 text-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="new-team-description" className="text-white">Description</Label>
                            <Textarea
                                id="new-team-description"
                                value={newTeamDescription}
                                onChange={(e) => setNewTeamDescription(e.target.value)}
                                placeholder="Optional description..."
                                className="bg-gray-800/50 border-white/10 text-white resize-none"
                                rows={3}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            onClick={createTeam}
                            disabled={creatingTeam || !newTeamName}
                            className="bg-orange-600 hover:bg-orange-500"
                        >
                            {creatingTeam ? (
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
        </div>
    )
}