"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Activity,
    CreditCard,
    Key,
    Settings,
    Trash2,
    Loader2,
} from "lucide-react"
import { toast } from "sonner"
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

interface TeamActivity {
    id: string
    action_type: string
    description: string
    metadata: any
    created_at: string
}

export default function ActivityPage() {
  usePageTitle('AI Platform Activity')
    const supabase = createClient()
    const router = useRouter()
    const [currentTeam, setCurrentTeam] = useState<Team | null>(null)
    const [loading, setLoading] = useState(true)
    const [activity, setActivity] = useState<TeamActivity[]>([])
    const [loadingActivity, setLoadingActivity] = useState(false)

    useEffect(() => {
        loadTeam()
    }, [])

    useEffect(() => {
        if (currentTeam) {
            loadTeamActivity(currentTeam.id)
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
                .select('*')
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

    async function loadTeamActivity(teamId: string) {
        try {
            setLoadingActivity(true)
            const { data, error } = await supabase
                .from('ai_platform_activity')
                .select('*')
                .eq('team_id', teamId)
                .order('created_at', { ascending: false })
                .limit(50)

            if (error) throw error

            setActivity(data || [])
        } catch (error) {
            console.error('Error loading activity:', error)
        } finally {
            setLoadingActivity(false)
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

    const getActivityIcon = (type: string) => {
        switch (type) {
            case 'api_request': return <Activity className="h-4 w-4" />
            case 'payment': return <CreditCard className="h-4 w-4" />
            case 'key_created': return <Key className="h-4 w-4" />
            case 'key_deleted': return <Trash2 className="h-4 w-4" />
            case 'settings_updated': return <Settings className="h-4 w-4" />
            default: return <Activity className="h-4 w-4" />
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
                    <h1 className="text-4xl font-bold text-white mb-2">Activity Feed</h1>
                    <p className="text-gray-400">Recent actions and events for {currentTeam.name}</p>
                </div>
            </div>

            <Card className="bg-gray-900/50 backdrop-blur-xl border-white/5">
                <CardHeader>
                    <CardTitle className="text-white">Recent Activity</CardTitle>
                    <CardDescription className="text-gray-400">
                        Latest 50 actions for this team
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loadingActivity ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
                        </div>
                    ) : activity.length === 0 ? (
                        <div className="text-center py-8">
                            <Activity className="mx-auto h-12 w-12 text-gray-600 opacity-20 mb-2" />
                            <p className="text-gray-400">No activity yet</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {activity.map((item) => (
                                <div key={item.id} className="flex items-start gap-3 p-3 bg-gray-800/30 rounded-lg border border-white/5">
                                    <div className="p-2 bg-purple-500/20 rounded-lg">
                                        {getActivityIcon(item.action_type)}
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-white text-sm">{item.description}</p>
                                        <p className="text-gray-400 text-xs mt-1">{formatDate(item.created_at)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
