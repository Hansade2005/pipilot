"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
    Key,
    Plus,
    Trash2,
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

export default function ApiKeysPage() {
  usePageTitle('API Keys')
    const supabase = createClient()
    const router = useRouter()
    const [currentTeam, setCurrentTeam] = useState<Team | null>(null)
    const [loading, setLoading] = useState(true)

    // API Keys state
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
    const [loadingKeys, setLoadingKeys] = useState(false)
    const [creatingKey, setCreatingKey] = useState(false)
    const [showCreateKeyDialog, setShowCreateKeyDialog] = useState(false)
    const [newKeyName, setNewKeyName] = useState('')
    const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null)
    const [showNewKeyDialog, setShowNewKeyDialog] = useState(false)

    useEffect(() => {
        loadTeam()
    }, [])

    useEffect(() => {
        if (currentTeam) {
            loadApiKeys()
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

            // Try to get selected team from local storage
            const storedTeamId = localStorage.getItem('current_ai_team_id')

            if (!storedTeamId) {
                // If no team selected, redirect to overview to select/create one
                router.push('/ai/platform')
                return
            }

            const { data: team, error } = await supabase
                .from('ai_platform_teams')
                .select('*')
                .eq('id', storedTeamId)
                .single()

            if (error || !team) {
                // If team not found (e.g. deleted), redirect
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

    async function createApiKey() {
        if (!newKeyName.trim()) {
            toast.error('Please enter a key name')
            return
        }

        try {
            setCreatingKey(true)
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
                toast.success('API key created successfully!')
                setNewKeyName('')
                setShowCreateKeyDialog(false)
                setNewlyCreatedKey(data.apiKey)
                setShowNewKeyDialog(true)
                await loadApiKeys()
            } else {
                const error = await response.json()
                toast.error(error.error || 'Failed to create API key')
            }
        } catch (error) {
            console.error('Error creating API key:', error)
            toast.error('Failed to create API key')
        } finally {
            setCreatingKey(false)
        }
    }

    async function deactivateApiKey(keyId: string) {
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
                toast.success('API key deactivated')
                await loadApiKeys()
            } else {
                const error = await response.json()
                toast.error(error.error || 'Failed to deactivate API key')
            }
        } catch (error) {
            console.error('Error deactivating API key:', error)
            toast.error('Failed to deactivate API key')
        }
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

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
        toast.success('Copied to clipboard')
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
                    <h1 className="text-4xl font-bold text-white mb-2">API Keys</h1>
                    <p className="text-gray-400">Manage API keys for {currentTeam.name}</p>
                </div>
            </div>

            <Card className="bg-gray-900/50 backdrop-blur-xl border-white/5">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-white">Active Keys</CardTitle>
                            <CardDescription className="text-gray-400">
                                Manage your API keys for accessing the PiPilot AI Models
                            </CardDescription>
                        </div>
                        <Button
                            onClick={() => setShowCreateKeyDialog(true)}
                            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500"
                        >
                            <Plus className="mr-2 h-4 w-4" />
                            Create Key
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {loadingKeys ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
                        </div>
                    ) : apiKeys.length === 0 ? (
                        <div className="text-center py-8">
                            <Key className="mx-auto h-12 w-12 text-gray-600 opacity-20 mb-2" />
                            <p className="text-gray-400">No API keys yet</p>
                            <p className="text-gray-500 text-sm mt-2">Create your first API key to get started</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {apiKeys.map((key) => (
                                <div key={key.id} className="flex items-center justify-between p-4 bg-gray-800/30 rounded-lg border border-white/5">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-purple-500/20 rounded-lg">
                                            <Key className="h-4 w-4 text-purple-400" />
                                        </div>
                                        <div>
                                            <p className="text-white font-medium">{key.name}</p>
                                            <p className="text-gray-400 text-sm">
                                                {key.key_prefix}... • Created {formatDate(key.created_at)}
                                                {key.last_used && ` • Last used ${formatDate(key.last_used)}`}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant={key.is_active ? "default" : "secondary"} className={key.is_active ? "bg-green-500/20 text-green-400" : ""}>
                                            {key.is_active ? "Active" : "Inactive"}
                                        </Badge>
                                        {key.is_active && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => deactivateApiKey(key.id)}
                                                className="border-red-500/20 text-red-400 hover:bg-red-500/10"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Create Key Dialog */}
            <Dialog open={showCreateKeyDialog} onOpenChange={setShowCreateKeyDialog}>
                <DialogContent className="bg-gray-900 border-white/10">
                    <DialogHeader>
                        <DialogTitle className="text-white">Create API Key</DialogTitle>
                        <DialogDescription className="text-gray-400">
                            Create a new API key for accessing the PiPilot AI Models
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="key-name" className="text-white">Key Name</Label>
                            <Input
                                id="key-name"
                                value={newKeyName}
                                onChange={(e) => setNewKeyName(e.target.value)}
                                placeholder="e.g., Production API Key"
                                className="bg-gray-800/50 border-white/10 text-white"
                                maxLength={50}
                            />
                            <p className="text-xs text-gray-400">Choose a descriptive name for your API key</p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            onClick={createApiKey}
                            disabled={creatingKey || !newKeyName.trim()}
                            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500"
                        >
                            {creatingKey ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                <>
                                    <Key className="mr-2 h-4 w-4" />
                                    Create API Key
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* New Key Display Dialog */}
            <Dialog open={showNewKeyDialog} onOpenChange={setShowNewKeyDialog}>
                <DialogContent className="bg-gray-900 border-white/10">
                    <DialogHeader>
                        <DialogTitle className="text-white">API Key Created</DialogTitle>
                        <DialogDescription className="text-gray-400">
                            Please copy your API key now. You won't be able to see it again!
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="p-4 bg-gray-800 rounded-lg border border-white/10 break-all font-mono text-sm text-purple-300">
                            {newlyCreatedKey}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            onClick={() => copyToClipboard(newlyCreatedKey || '')}
                            variant="outline"
                            className="border-white/10 text-white hover:bg-white/5 mr-2"
                        >
                            Copy to Clipboard
                        </Button>
                        <Button
                            onClick={() => setShowNewKeyDialog(false)}
                            className="bg-purple-600 hover:bg-purple-500"
                        >
                            Done
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
