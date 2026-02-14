"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
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

export default function SettingsPage() {
  usePageTitle('AI Platform Settings')
    const supabase = createClient()
    const router = useRouter()
    const [currentTeam, setCurrentTeam] = useState<Team | null>(null)
    const [loading, setLoading] = useState(true)
    const [teamsCount, setTeamsCount] = useState(0)

    useEffect(() => {
        loadTeam()
    }, [])

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

            // Check total teams count for delete validation
            const { count } = await supabase
                .from('ai_platform_teams')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id)

            setTeamsCount(count || 0)

        } catch (error) {
            console.error('Error loading team:', error)
            toast.error('Failed to load team')
        } finally {
            setLoading(false)
        }
    }

    async function deleteTeam() {
        if (!currentTeam) return

        if (teamsCount <= 1) {
            toast.error('Cannot delete your only team')
            return
        }

        if (!confirm(`Are you sure you want to delete the team "${currentTeam.name}"? This action cannot be undone.`)) {
            return
        }

        try {
            const { error } = await supabase
                .from('ai_platform_teams')
                .delete()
                .eq('id', currentTeam.id)

            if (error) throw error

            toast.success('Team deleted')
            localStorage.removeItem('current_ai_team_id')
            router.push('/ai/platform')
        } catch (error) {
            console.error('Error deleting team:', error)
            toast.error('Failed to delete team')
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
                    <h1 className="text-4xl font-bold text-white mb-2">Settings</h1>
                    <p className="text-gray-400">Manage configuration for {currentTeam.name}</p>
                </div>
            </div>

            <Card className="bg-gray-900/50 backdrop-blur-xl border-white/5">
                <CardHeader>
                    <CardTitle className="text-white">Team Settings</CardTitle>
                    <CardDescription className="text-gray-400">
                        Manage team configuration and danger zone
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label className="text-white">Danger Zone</Label>
                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                            <h4 className="text-white font-medium mb-2">Delete Team</h4>
                            <p className="text-gray-400 text-sm mb-3">
                                Once you delete a team, there is no going back. Please be certain.
                            </p>
                            <Button
                                variant="destructive"
                                onClick={deleteTeam}
                                disabled={teamsCount <= 1}
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete Team
                            </Button>
                            {teamsCount <= 1 && (
                                <p className="text-xs text-gray-400 mt-2">Cannot delete your only team</p>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
