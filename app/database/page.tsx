"use client"

import { useEffect, useState, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Database,
    Table,
    HardDrive,
    Zap,
    Plus,
    FileText,
    ArrowUp,
    ArrowDown,
    Loader2,
    Sparkles
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CreateTableDialog } from '@/components/database/create-table-dialog'
import { TableDetailsView } from '@/components/database/table-details-view'
import { EditTableDialog } from '@/components/database/edit-table-dialog'
import { DeleteTableDialog } from '@/components/database/delete-table-dialog'
import { AISchemaGenerator } from '@/components/database/ai-schema-generator'
import ApiKeysManager from '@/components/database/api-keys-manager'
import StorageManager from '@/components/database/storage-manager'
import { ApiDocsGenerator } from '@/components/database/api-docs-generator'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ActivityFeed from '@/components/database/activity-feed'
import type { Table as TableType } from '@/lib/supabase'
import { usePageTitle } from '@/hooks/use-page-title'

interface DatabaseData {
    id: number
    name: string
    project_id: string
    created_at: string
}

interface TableWithCount extends TableType {
    recordCount: number
}

export default function DatabaseDashboard() {
  usePageTitle('Database')
    const [database, setDatabase] = useState<DatabaseData | null>(null)
    const [tables, setTables] = useState<TableWithCount[]>([])
    const [loading, setLoading] = useState(true)
    const [creating, setCreating] = useState(false)
    const [databaseName, setDatabaseName] = useState('')
    const [activeTab, setActiveTab] = useState('overview')
    const [editingTable, setEditingTable] = useState<TableWithCount | null>(null)
    const [deletingTable, setDeletingTable] = useState<TableWithCount | null>(null)
    const [showAISchemaGenerator, setShowAISchemaGenerator] = useState(false)
    const [showApiDocsGenerator, setShowApiDocsGenerator] = useState(false)

    // Animated stats
    const [animatedStats, setAnimatedStats] = useState({
        tables: 0,
        records: 0,
        storage: 0,
        requests: 0
    })

    const [realStats, setRealStats] = useState({
        storage: 0,
        requests: 0
    })

    useEffect(() => {
        loadUserDatabase()
    }, [])

    // Auto-refresh every 5 seconds
    useEffect(() => {
        if (!database) return

        const interval = setInterval(() => {
            silentRefresh()
        }, 5000)

        return () => clearInterval(interval)
    }, [database])

    const initialAnimationDone = useRef(false)

    // Animate numbers
    useEffect(() => {
        if (!database) return

        const targetStats = {
            tables: tables.length,
            records: tables.reduce((sum, table) => sum + table.recordCount, 0),
            storage: realStats.storage,
            requests: realStats.requests
        }

        // If initial animation is done, update immediately without animation
        // This prevents the "reset to 0" flickering on auto-refresh
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
                tables: Math.floor(targetStats.tables * progress),
                records: Math.floor(targetStats.records * progress),
                storage: Math.floor(targetStats.storage * progress),
                requests: Math.floor(targetStats.requests * progress)
            })

            if (step >= steps) {
                clearInterval(timer)
                setAnimatedStats(targetStats)
                initialAnimationDone.current = true
            }
        }, interval)

        return () => clearInterval(timer)
    }, [tables, database, realStats])

    async function loadUserDatabase() {
        try {
            setLoading(true)
            const storedDbId = localStorage.getItem('user_database_id')

            // Fetch all databases to check if stored ID exists
            const listResponse = await fetch('/api/database/list')
            if (listResponse.ok) {
                const listData = await listResponse.json()

                if (listData.databases && listData.databases.length > 0) {
                    // Check if stored database exists
                    const storedDbExists = storedDbId && listData.databases.find((db: any) => db.id.toString() === storedDbId)

                    if (storedDbExists) {
                        // Load the stored database
                        await loadDatabase(parseInt(storedDbId))
                    } else {
                        // Auto-select first database
                        const firstDb = listData.databases[0]
                        localStorage.setItem('user_database_id', firstDb.id.toString())
                        await loadDatabase(firstDb.id)
                    }
                } else {
                    // No databases exist - will show create form
                    setLoading(false)
                }
            } else if (storedDbId) {
                // Fallback to old behavior if list endpoint fails
                await loadDatabase(parseInt(storedDbId))
            }
        } catch (error) {
            console.error('Error loading database:', error)
        } finally {
            setLoading(false)
        }
    }

    async function loadDatabase(databaseId: number, silent = false) {
        try {
            const [dbResponse, storageResponse, apiKeysResponse] = await Promise.all([
                fetch(`/api/database/${databaseId}`),
                fetch(`/api/database/${databaseId}/storage`),
                fetch(`/api/database/${databaseId}/api-keys`)
            ])

            const dbData = await dbResponse.json()

            if (dbData.success) {
                setDatabase(dbData.database)
                const transformedTables = (dbData.tables || []).map((table: any) => ({
                    ...table,
                    recordCount: table.record_count || 0,
                }))
                setTables(transformedTables)

                // Process storage stats
                let storageUsedBytes = 0
                if (storageResponse.ok) {
                    const storageData = await storageResponse.json()
                    storageUsedBytes = storageData.bucket?.current_usage_bytes || 0
                }

                // Process API stats
                let totalRequests = 0
                if (apiKeysResponse.ok) {
                    const apiKeysData = await apiKeysResponse.json()
                    totalRequests = (apiKeysData.api_keys || []).reduce((sum: number, key: any) => {
                        return sum + (key.usage?.total || 0)
                    }, 0)
                }

                setRealStats({
                    storage: storageUsedBytes,
                    requests: totalRequests
                })

            } else if (!silent) {
                console.error('Failed to load database:', dbData.error)
            }
        } catch (error) {
            if (!silent) {
                console.error('Error fetching database:', error)
            }
        }
    }

    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes'
        const k = 1024
        const sizes = ['Bytes', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    async function silentRefresh() {
        try {
            if (!database?.id) return
            await loadDatabase(database.id, true)
        } catch (error) {
            console.error('Silent refresh error:', error)
        }
    }

    async function createDatabase() {
        if (!databaseName || databaseName.trim().length === 0) {
            toast.error('Please enter a database name')
            return
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(databaseName.trim())) {
            toast.error('Database name can only contain letters, numbers, underscores, and hyphens')
            return
        }

        try {
            setCreating(true)

            // Generate unique project ID with timestamp
            const projectId = `db_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

            const response = await fetch('/api/database/create-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId: projectId,
                    name: databaseName.trim()
                })
            })

            const data = await response.json()

            if (!response.ok) {
                toast.error(data.error || `Failed to create database (Error ${response.status})`)
                return
            }

            if (data.success) {
                toast.success('🎉 Database created successfully!')

                // Store database ID in localStorage
                localStorage.setItem('user_database_id', data.database.id.toString())

                // Reload data
                await loadDatabase(data.database.id)
            } else {
                toast.error(data.error || 'Failed to create database')
            }
        } catch (error) {
            console.error('Error creating database:', error)
            toast.error(error instanceof Error ? error.message : 'Failed to create database. Please try again.')
        } finally {
            setCreating(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
            </div>
        )
    }

    // No database - show creation form
    if (!database) {
        return (
            <div className="p-8 flex items-center justify-center min-h-screen animate-in fade-in slide-in-from-bottom-4 duration-500">
                <Card className="bg-gray-900/50 backdrop-blur-xl border-white/5 max-w-2xl w-full">
                    <CardHeader className="text-center">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-purple-500/10 to-pink-500/10">
                            <Database className="h-8 w-8 bg-gradient-to-br from-purple-400 to-pink-400 bg-clip-text text-transparent" />
                        </div>
                        <CardTitle className="text-3xl text-white">Create Your Database</CardTitle>
                        <CardDescription className="text-lg">
                            Get started with a fully managed PostgreSQL database in seconds
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-3">
                            <Label htmlFor="databaseName" className="text-white text-base">
                                Database Name
                            </Label>
                            <Input
                                id="databaseName"
                                type="text"
                                placeholder="my_awesome_db"
                                value={databaseName}
                                onChange={(e) => setDatabaseName(e.target.value)}
                                className="bg-gray-900/50 border-white/10 text-white placeholder:text-gray-500 h-12 text-lg"
                                disabled={creating}
                            />
                            <p className="text-xs text-gray-500">
                                Use letters, numbers, underscores, and hyphens only
                            </p>
                        </div>

                        <div className="rounded-lg border border-white/10 bg-gray-900/30 p-6 space-y-3">
                            <h3 className="font-semibold text-white text-lg">What you'll get:</h3>
                            <ul className="space-y-3 text-sm text-gray-300">
                                <li className="flex items-start gap-3">
                                    <span className="text-purple-400 text-lg">✓</span>
                                    <span>500MB PostgreSQL database with full admin access</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <span className="text-purple-400 text-lg">✓</span>
                                    <span>Auto-generated REST APIs for all tables</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <span className="text-purple-400 text-lg">✓</span>
                                    <span>AI-powered schema generation</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <span className="text-purple-400 text-lg">✓</span>
                                    <span>File storage with 500MB capacity</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <span className="text-purple-400 text-lg">✓</span>
                                    <span>Built-in authentication system</span>
                                </li>
                            </ul>
                        </div>

                        <Button
                            onClick={createDatabase}
                            disabled={creating}
                            className="w-full h-12 text-base bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 shadow-lg shadow-purple-500/20"
                            size="lg"
                        >
                            {creating ? (
                                <>
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                    Creating Database...
                                </>
                            ) : (
                                <>
                                    <Database className="mr-2 h-5 w-5" />
                                    Create Database
                                </>
                            )}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    // Has database - show dashboard
    const statCards = [
        {
            title: "Tables",
            value: animatedStats.tables,
            change: 0,
            icon: Table,
            color: "from-blue-500 to-cyan-500",
            bgColor: "from-blue-500/10 to-cyan-500/10"
        },
        {
            title: "Total Records",
            value: animatedStats.records.toLocaleString(),
            change: 0,
            icon: Database,
            color: "from-purple-500 to-pink-500",
            bgColor: "from-purple-500/10 to-pink-500/10"
        },
        {
            title: "Storage Used",
            value: formatBytes(animatedStats.storage),
            change: 0,
            icon: HardDrive,
            color: "from-green-500 to-emerald-500",
            bgColor: "from-green-500/10 to-emerald-500/10"
        },
        {
            title: "API Requests",
            value: animatedStats.requests.toLocaleString(),
            change: 0,
            icon: Zap,
            color: "from-yellow-500 to-orange-500",
            bgColor: "from-yellow-500/10 to-orange-500/10"
        }
    ]

    return (
        <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-4xl font-bold text-foreground mb-2">{database.name}</h1>
                        <p className="text-muted-foreground">Created {new Date(database.created_at).toLocaleDateString()}</p>
                    </div>
                    <TabsList className="bg-muted border border-border">
                        <TabsTrigger value="overview" className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:font-semibold dark:data-[state=active]:bg-primary/10">
                            Overview
                        </TabsTrigger>
                        <TabsTrigger value="tables" className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:font-semibold dark:data-[state=active]:bg-primary/10">
                            Tables
                        </TabsTrigger>
                        <TabsTrigger value="storage" className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:font-semibold dark:data-[state=active]:bg-primary/10">
                            Storage
                        </TabsTrigger>
                        <TabsTrigger value="api-keys" className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:font-semibold dark:data-[state=active]:bg-primary/10">
                            API Keys
                        </TabsTrigger>
                    </TabsList>
                </div>

                {/* Overview Tab */}
                <TabsContent value="overview" className="space-y-6">
                    {/* Stats Grid */}
                    <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                        {statCards.map((stat, index) => {
                            const Icon = stat.icon
                            const isPositive = stat.change > 0

                            return (
                                <Card
                                    key={stat.title}
                                    className="relative overflow-hidden bg-card backdrop-blur-xl border-border hover:border-primary/30 transition-all duration-300 hover:scale-105 group shadow-sm"
                                    style={{ animationDelay: `${index * 100}ms` }}
                                >
                                    <div className={`absolute inset-0 bg-gradient-to-br ${stat.bgColor} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />

                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                                        <CardTitle className="text-sm font-medium text-muted-foreground">
                                            {stat.title}
                                        </CardTitle>
                                        <div className={`p-2 rounded-lg bg-gradient-to-br ${stat.bgColor}`}>
                                            <Icon className="h-4 w-4 text-primary" />
                                        </div>
                                    </CardHeader>
                                    <CardContent className="relative z-10">
                                        <div className="text-3xl font-bold text-foreground mb-1">
                                            {stat.value}
                                        </div>
                                        <div className="flex items-center gap-1 text-sm">
                                            {stat.change !== 0 && (
                                                <>
                                                    {isPositive ? (
                                                        <>
                                                            <ArrowUp className="h-4 w-4 text-green-400" />
                                                            <span className="text-green-400 font-medium">{stat.change}%</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <ArrowDown className="h-4 w-4 text-red-400" />
                                                            <span className="text-red-400 font-medium">{Math.abs(stat.change)}%</span>
                                                        </>
                                                    )}
                                                    <span className="text-muted-foreground">vs last month</span>
                                                </>
                                            )}
                                            {stat.change === 0 && (
                                                <span className="text-muted-foreground text-xs">Current value</span>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            )
                        })}
                    </div>


                    {/* Recent Activity */}
                    <ActivityFeed databaseId={database.id.toString()} />
                </TabsContent>

                {/* Tables Tab */}
                <TabsContent value="tables" className="space-y-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-white">Tables</h2>
                            <p className="text-gray-400">Manage your database tables and schemas</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                variant="outline"
                                onClick={() => setShowApiDocsGenerator(true)}
                                className="border-white/10 text-white hover:bg-white/5"
                            >
                                <FileText className="h-4 w-4 mr-2" />
                                API Docs
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => setShowAISchemaGenerator(true)}
                                className="border-white/10 text-white hover:bg-white/5"
                            >
                                <Sparkles className="h-4 w-4 mr-2" />
                                Generate with AI
                            </Button>
                            <CreateTableDialog
                                databaseId={database.id.toString()}
                                onSuccess={() => loadDatabase(database.id)}
                            />
                        </div>
                    </div>

                    {tables.length === 0 ? (
                        <Card className="bg-gray-900/50 backdrop-blur-xl border-white/5">
                            <CardContent className="text-center py-12">
                                <Table className="mx-auto h-12 w-12 mb-4 opacity-20 text-gray-600" />
                                <p className="text-gray-400 mb-4">No tables yet. Create your first table to get started.</p>
                                <CreateTableDialog
                                    databaseId={database.id.toString()}
                                    onSuccess={() => loadDatabase(database.id)}
                                >
                                    <Button className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500">
                                        <Plus className="mr-2 h-4 w-4" />
                                        Create Your First Table
                                    </Button>
                                </CreateTableDialog>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-4">
                            {tables.map((table) => (
                                <TableDetailsView
                                    key={table.id}
                                    table={table}
                                    onEdit={() => setEditingTable(table)}
                                    onDelete={() => setDeletingTable(table)}
                                />
                            ))}
                        </div>
                    )}
                </TabsContent>

                {/* Storage Tab */}
                <TabsContent value="storage">
                    <StorageManager databaseId={database.id.toString()} />
                </TabsContent>

                {/* API Keys Tab */}
                <TabsContent value="api-keys">
                    <ApiKeysManager databaseId={database.id.toString()} />
                </TabsContent>
            </Tabs>

            {/* Dialogs */}
            {editingTable && (
                <EditTableDialog
                    table={editingTable}
                    databaseId={database.id.toString()}
                    open={!!editingTable}
                    onOpenChange={(open) => !open && setEditingTable(null)}
                    onSuccess={() => {
                        loadDatabase(database.id)
                        setEditingTable(null)
                    }}
                />
            )}

            {deletingTable && (
                <DeleteTableDialog
                    table={deletingTable}
                    databaseId={database.id.toString()}
                    open={!!deletingTable}
                    onOpenChange={(open) => !open && setDeletingTable(null)}
                    onSuccess={() => {
                        loadDatabase(database.id)
                        setDeletingTable(null)
                    }}
                />
            )}

            <ApiDocsGenerator
                databaseId={database.id.toString()}
                tables={tables.map(t => ({
                    id: t.id.toString(),
                    name: t.name,
                    schema: t.schema_json
                }))}
                open={showApiDocsGenerator}
                onOpenChange={setShowApiDocsGenerator}
            />

            <Dialog open={showAISchemaGenerator} onOpenChange={setShowAISchemaGenerator}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-gray-900 border-white/10">
                    <DialogHeader>
                        <DialogTitle className="text-white">Generate Table Schema with AI</DialogTitle>
                    </DialogHeader>
                    <AISchemaGenerator
                        workspaceId={database.project_id}
                        databaseId={database.id.toString()}
                        onSchemaGenerated={(schema) => {
                            console.log('Schema generated:', schema)
                        }}
                        onCreateTable={async (schema) => {
                            try {
                                const tableData = {
                                    name: schema.tableName,
                                    schema_json: {
                                        columns: schema.columns.map(col => ({
                                            name: col.name,
                                            type: col.type,
                                            required: col.required || false,
                                            defaultValue: col.defaultValue || null,
                                            unique: col.unique || false,
                                            primary_key: col.name === 'id',
                                            description: col.description || '',
                                            references: col.references || null
                                        })),
                                        indexes: schema.indexes || []
                                    }
                                }

                                const response = await fetch(`/api/database/${database.id}/tables/create`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(tableData)
                                })

                                if (!response.ok) {
                                    const errorData = await response.json()
                                    throw new Error(errorData.error || 'Failed to create table')
                                }

                                toast.success(`Table "${schema.tableName}" created successfully!`)
                                setShowAISchemaGenerator(false)
                                await loadDatabase(database.id)
                            } catch (error) {
                                console.error('Error creating table from AI schema:', error)
                                toast.error(error instanceof Error ? error.message : 'Failed to create table')
                            }
                        }}
                    />
                </DialogContent>
            </Dialog>
        </div>
    )
}
