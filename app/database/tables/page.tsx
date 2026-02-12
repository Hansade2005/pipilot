"use client"

import { useEffect, useState } from "react"
import { Database as DatabaseIcon, Loader2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { TableExplorer } from "@/components/workspace/database-tab/table-explorer"
import { RecordViewer } from "@/components/workspace/database-tab/record-viewer"
import { toast } from "sonner"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import type { TableWithCount, RecordData } from "@/components/workspace/database-tab/types"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { usePageTitle } from '@/hooks/use-page-title'

export default function TablesPage() {
  usePageTitle('Database Tables')
    const [database, setDatabase] = useState<any>(null)
    const [tables, setTables] = useState<TableWithCount[]>([])
    const [selectedTable, setSelectedTable] = useState<TableWithCount | null>(null)
    const [records, setRecords] = useState<RecordData[]>([])
    const [loading, setLoading] = useState(true)
    const [loadingRecords, setLoadingRecords] = useState(false)
    const [showTableExplorer, setShowTableExplorer] = useState(true)
    const isMobile = useIsMobile()

    useEffect(() => {
        initializeDatabase()
    }, [])

    // Auto-refresh tables every 5 seconds
    useEffect(() => {
        if (!database) return

        const interval = setInterval(() => {
            loadTables(database.id.toString(), true)
        }, 5000)

        return () => clearInterval(interval)
    }, [database])

    // Auto-refresh records every 5 seconds when a table is selected
    useEffect(() => {
        if (!database || !selectedTable) return

        const interval = setInterval(() => {
            loadRecords(database.id.toString(), selectedTable.id.toString(), true)
        }, 5000)

        return () => clearInterval(interval)
    }, [database, selectedTable])

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
                await loadTables(dbId)
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

    async function loadTables(dbId: string, silent = false) {
        try {
            const response = await fetch(`/api/database/${dbId}`)
            const data = await response.json()

            if (data.success) {
                const transformedTables = (data.tables || []).map((table: any) => ({
                    ...table,
                    recordCount: table.record_count || 0,
                }))
                setTables(transformedTables)

                // If a table was selected, update it with the new data
                if (selectedTable) {
                    const updatedSelectedTable = transformedTables.find(
                        (t: TableWithCount) => t.id === selectedTable.id
                    )
                    if (updatedSelectedTable) {
                        setSelectedTable(updatedSelectedTable)
                    } else {
                        // Table was deleted
                        setSelectedTable(null)
                        setRecords([])
                    }
                }
            } else if (!silent) {
                toast.error(data.error || 'Failed to load tables')
            }
        } catch (error) {
            if (!silent) {
                console.error('Error loading tables:', error)
                toast.error('Failed to load tables')
            }
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
                toast.error(data.error || 'Failed to load records')
            }
        } catch (error) {
            if (!silent) {
                console.error('Error loading records:', error)
                toast.error('Failed to load records')
            }
        } finally {
            if (!silent) setLoadingRecords(false)
        }
    }

    const handleTableSelect = (table: TableWithCount) => {
        setSelectedTable(table)
        if (database) {
            loadRecords(database.id.toString(), table.id.toString())
        }
        // Close table explorer after selection on mobile
        if (isMobile) {
            setShowTableExplorer(false)
        }
    }

    const handleRefreshTables = () => {
        if (database) {
            loadTables(database.id.toString())
            toast.success('Tables refreshed')
        }
    }

    const handleRefreshRecords = () => {
        if (database && selectedTable) {
            loadRecords(database.id.toString(), selectedTable.id.toString())
            toast.success('Records refreshed')
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

    // Mobile layout - don't use resizable panels
    if (isMobile) {
        return (
            <div className="flex flex-col h-full overflow-hidden relative bg-background">
                <div className="flex flex-1 overflow-hidden">
                    {/* Table Explorer - Mobile Overlay */}
                    {showTableExplorer && (
                        <div className="absolute inset-y-0 left-0 w-80 bg-background shadow-lg z-20 border-r border-border overflow-y-auto">
                            <TableExplorer
                                tables={tables}
                                selectedTable={selectedTable}
                                onTableSelect={handleTableSelect}
                                loading={false}
                                databaseId={database.id.toString()}
                                onRefresh={handleRefreshTables}
                                onToggleExplorer={() => setShowTableExplorer(!showTableExplorer)}
                                showExplorer={showTableExplorer}
                            />
                        </div>
                    )}

                    {/* Mobile Overlay - Click to close */}
                    {showTableExplorer && (
                        <div
                            className="absolute inset-0 bg-black/50 z-10"
                            onClick={() => setShowTableExplorer(false)}
                        />
                    )}

                    {/* Right Panel - Record Viewer */}
                    <div className="flex-1 overflow-y-auto">
                        <RecordViewer
                            table={selectedTable}
                            records={records}
                            loading={loadingRecords}
                            databaseId={database.id.toString()}
                            onRefresh={handleRefreshRecords}
                            onToggleExplorer={() => setShowTableExplorer(!showTableExplorer)}
                            showExplorer={showTableExplorer}
                        />
                    </div>
                </div>
            </div>
        )
    }

    // Desktop layout - use resizable panels
    return (
        <div className="flex flex-col h-full overflow-hidden bg-background">
            <ResizablePanelGroup direction="horizontal" className="h-full">
                {/* Table Explorer - Resizable Panel */}
                {showTableExplorer && (
                    <>
                        <ResizablePanel
                            defaultSize={25}
                            minSize={15}
                            maxSize={40}
                            className="overflow-y-auto"
                        >
                            <TableExplorer
                                tables={tables}
                                selectedTable={selectedTable}
                                onTableSelect={handleTableSelect}
                                loading={false}
                                databaseId={database.id.toString()}
                                onRefresh={handleRefreshTables}
                                onToggleExplorer={() => setShowTableExplorer(!showTableExplorer)}
                                showExplorer={showTableExplorer}
                            />
                        </ResizablePanel>

                        {/* Resizable Handle */}
                        <ResizableHandle className="w-1 bg-border hover:bg-purple-500 transition-colors" />
                    </>
                )}

                {/* Right Panel - Record Viewer */}
                <ResizablePanel defaultSize={showTableExplorer ? 75 : 100}>
                    <RecordViewer
                        table={selectedTable}
                        records={records}
                        loading={loadingRecords}
                        databaseId={database.id.toString()}
                        onRefresh={handleRefreshRecords}
                        onToggleExplorer={() => setShowTableExplorer(!showTableExplorer)}
                        showExplorer={showTableExplorer}
                    />
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    )
}
