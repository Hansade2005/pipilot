"use client"

import { useEffect, useState } from "react"
import { Database as DatabaseIcon, Users, Loader2, TrendingUp } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { RecordViewer } from "@/components/workspace/database-tab/record-viewer"
import { toast } from "sonner"
import type { TableWithCount, RecordData } from "@/components/workspace/database-tab/types"
import { usePageTitle } from '@/hooks/use-page-title'

export default function AuthPage() {
  usePageTitle('Database Auth')
    const [database, setDatabase] = useState<any>(null)
    const [usersTable, setUsersTable] = useState<TableWithCount | null>(null)
    const [records, setRecords] = useState<RecordData[]>([])
    const [loading, setLoading] = useState(true)
    const [loadingRecords, setLoadingRecords] = useState(false)

    useEffect(() => {
        initializeDatabase()
    }, [])

    // Auto-refresh records every 5 seconds
    useEffect(() => {
        if (!database || !usersTable) return

        const interval = setInterval(() => {
            loadRecords(database.id.toString(), usersTable.id.toString(), true)
        }, 5000)

        return () => clearInterval(interval)
    }, [database, usersTable])

    async function initializeDatabase() {
        try {
            setLoading(true)
            const dbId = localStorage.getItem('user_database_id')

            if (!dbId) {
                toast.error('No database selected')
                setLoading(false)
                return
            }

            const response = await fetch(`/api/database/${dbId}`)
            const data = await response.json()

            if (data.success) {
                setDatabase(data.database)

                // Find the users table
                const foundUsersTable = data.tables?.find((t: any) => t.name === 'users')
                if (foundUsersTable) {
                    const transformedTable = {
                        ...foundUsersTable,
                        recordCount: foundUsersTable.record_count || 0,
                    }
                    setUsersTable(transformedTable)
                    await loadRecords(dbId, foundUsersTable.id.toString())
                } else {
                    toast.error('Users table not found')
                }
            } else {
                toast.error(data.error || 'Failed to load database')
            }
        } catch (error: any) {
            console.error('Error initializing database:', error)
            toast.error(error.message || 'Failed to initialize database')
        } finally {
            setLoading(false)
        }
    }

    async function loadRecords(dbId: string, tableId: string, silent = false) {
        try {
            if (!silent) setLoadingRecords(true)

            const response = await fetch(`/api/database/${dbId}/tables/${tableId}/records`)
            const data = await response.json()

            if (response.ok) {
                setRecords(data.records || [])
            } else if (!silent) {
                toast.error(data.error || 'Failed to load users')
            }
        } catch (error) {
            if (!silent) {
                console.error('Error loading users:', error)
                toast.error('Failed to load users')
            }
        } finally {
            if (!silent) setLoadingRecords(false)
        }
    }

    const handleRefreshRecords = () => {
        if (database && usersTable) {
            loadRecords(database.id.toString(), usersTable.id.toString())
            toast.success('Users refreshed')
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
            </div>
        )
    }

    if (!database) {
        return (
            <div className="flex items-center justify-center h-full p-8">
                <Card className="bg-gray-900/50 backdrop-blur-xl border-white/5 max-w-md">
                    <CardContent className="pt-6 text-center">
                        <DatabaseIcon className="h-12 w-12 mx-auto mb-4 text-gray-600" />
                        <h3 className="text-xl font-semibold text-white mb-2">No Database Selected</h3>
                        <p className="text-gray-400">Please create or select a database to continue</p>
                    </CardContent>
                </Card>
            </div>
        )
    }

    if (!usersTable) {
        return (
            <div className="flex items-center justify-center h-full p-8">
                <Card className="bg-gray-900/50 backdrop-blur-xl border-white/5 max-w-md">
                    <CardContent className="pt-6 text-center">
                        <Users className="h-12 w-12 mx-auto mb-4 text-gray-600" />
                        <h3 className="text-xl font-semibold text-white mb-2">Users Table Not Found</h3>
                        <p className="text-gray-400">The users table should be created automatically</p>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full overflow-hidden bg-background">
            {/* Compact Stats Bar */}
            <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-purple-400" />
                    <span className="text-sm font-medium text-white">Authentication</span>
                </div>

                <div className="flex items-center gap-4 ml-auto">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-background border border-border rounded-md">
                        <span className="text-xs text-muted-foreground">Total Users:</span>
                        <span className="text-sm font-bold text-white">{records.length}</span>
                    </div>

                    <div className="flex items-center gap-2 px-3 py-1.5 bg-background border border-border rounded-md">
                        <TrendingUp className="h-3 w-3 text-green-400" />
                        <span className="text-xs text-muted-foreground">Active:</span>
                        <span className="text-sm font-bold text-white">{records.length}</span>
                    </div>

                    <div className="flex items-center gap-2 px-3 py-1.5 bg-background border border-border rounded-md">
                        <span className="text-xs text-muted-foreground">Provider:</span>
                        <span className="text-xs font-medium text-purple-300">Built-in</span>
                    </div>
                </div>
            </div>

            {/* Record Viewer - Full Height */}
            <div className="flex-1 overflow-hidden">
                <RecordViewer
                    table={usersTable}
                    records={records}
                    loading={loadingRecords}
                    databaseId={database.id.toString()}
                    onRefresh={handleRefreshRecords}
                    onToggleExplorer={undefined}
                    showExplorer={false}
                />
            </div>
        </div>
    )
}
