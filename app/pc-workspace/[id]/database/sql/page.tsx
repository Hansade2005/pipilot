'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import {
  Database,
  History,
  Settings,
  Play,
  Save,
  BookOpen,
  Zap,
  BarChart3,
  CheckCircle
} from 'lucide-react'
import { SQLEditor } from '@/components/database/sql-editor'
import { AIQueryAssistant } from '@/components/database/ai-query-assistant'
import { SQLResults } from '@/components/database/sql-results'
import { useToast } from '@/hooks/use-toast'
import { usePageTitle } from '@/hooks/use-page-title'

interface SQLPanelProps {
  databaseId: string
}

interface QueryHistoryItem {
  id: string
  sql: string
  timestamp: Date
  executionTime?: number
  rowCount?: number
  success: boolean
}

export default function SQLPanel({
  databaseId }: SQLPanelProps) {
  usePageTitle('SQL Editor')
  const [currentSQL, setCurrentSQL] = useState('')
  const [isExecuting, setIsExecuting] = useState(false)
  const [results, setResults] = useState<any[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [executionTime, setExecutionTime] = useState<number | null>(null)
  const [queryHistory, setQueryHistory] = useState<QueryHistoryItem[]>([])
  const [activeTab, setActiveTab] = useState<'editor' | 'assistant'>('editor')
  const { toast } = useToast()

  const executeSQL = useCallback(async (sql: string = currentSQL) => {
    if (!sql.trim()) {
      toast({
        title: 'No query',
        description: 'Please enter a SQL query to execute.',
        variant: 'destructive'
      })
      return
    }

    setIsExecuting(true)
    setError(null)
    setResults(null)
    const startTime = Date.now()

    try {
      const response = await fetch(`/api/database/${databaseId}/sql/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sql: sql.trim()
        })
      })

      const endTime = Date.now()
      const execTime = endTime - startTime
      setExecutionTime(execTime)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Query execution failed')
      }

      const data = await response.json()

      setResults(data.results || [])

      // Add to history
      const historyItem: QueryHistoryItem = {
        id: Date.now().toString(),
        sql: sql.trim(),
        timestamp: new Date(),
        executionTime: execTime,
        rowCount: data.results?.length || 0,
        success: true
      }

      setQueryHistory(prev => [historyItem, ...prev.slice(0, 49)]) // Keep last 50 queries

      toast({
        title: 'Query executed',
        description: `Returned ${data.results?.length || 0} rows in ${execTime}ms.`,
      })

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Query execution failed'
      setError(errorMessage)

      // Add failed query to history
      const historyItem: QueryHistoryItem = {
        id: Date.now().toString(),
        sql: currentSQL.trim(),
        timestamp: new Date(),
        executionTime: Date.now() - startTime,
        success: false
      }

      setQueryHistory(prev => [historyItem, ...prev.slice(0, 49)])

      toast({
        title: 'Query failed',
        description: errorMessage,
        variant: 'destructive'
      })
    } finally {
      setIsExecuting(false)
    }
  }, [currentSQL, databaseId, toast])

  const handleSQLGenerated = useCallback((sql: string, explanation: string) => {
    setCurrentSQL(sql)
    setActiveTab('editor')
    toast({
      title: 'SQL generated',
      description: 'Generated query loaded in editor.',
    })
  }, [toast])

  const handleExecuteGeneratedSQL = useCallback((sql: string) => {
    setCurrentSQL(sql)
    executeSQL(sql)
  }, [executeSQL])

  const loadFromHistory = useCallback((historyItem: QueryHistoryItem) => {
    setCurrentSQL(historyItem.sql)
    setActiveTab('editor')
    toast({
      title: 'Query loaded',
      description: 'Query from history loaded in editor.',
    })
  }, [toast])

  const clearHistory = useCallback(() => {
    setQueryHistory([])
    toast({
      title: 'History cleared',
      description: 'Query history has been cleared.',
    })
  }, [toast])

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database className="h-6 w-6 text-blue-600" />
            <div>
              <h1 className="text-xl font-semibold">SQL Panel</h1>
              <p className="text-sm text-gray-600">Write, execute, and analyze SQL queries with AI assistance</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="flex items-center gap-1">
              <Zap className="h-3 w-3" />
              AI Powered
            </Badge>

            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Left Panel - Editor/Assistant */}
          <ResizablePanel defaultSize={50} minSize={30}>
            <div className="h-full flex flex-col">
              {/* Tab Navigation */}
              <div className="border-b bg-gray-50 px-4 py-2">
                <div className="flex gap-1">
                  <Button
                    variant={activeTab === 'editor' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setActiveTab('editor')}
                    className="flex items-center gap-2"
                  >
                    <BookOpen className="h-4 w-4" />
                    SQL Editor
                  </Button>

                  <Button
                    variant={activeTab === 'assistant' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setActiveTab('assistant')}
                    className="flex items-center gap-2"
                  >
                    <Zap className="h-4 w-4" />
                    AI Assistant
                  </Button>
                </div>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-hidden">
                {activeTab === 'editor' ? (
                  <div className="h-full p-4">
                    <SQLEditor
                      value={currentSQL}
                      onChange={setCurrentSQL}
                      onExecute={executeSQL}
                      isExecuting={isExecuting}
                      databaseId={databaseId}
                    />
                  </div>
                ) : (
                  <div className="h-full p-4 overflow-y-auto">
                    <AIQueryAssistant
                      databaseId={databaseId}
                      onSQLGenerated={handleSQLGenerated}
                      onExecuteSQL={handleExecuteGeneratedSQL}
                    />
                  </div>
                )}
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right Panel - Results/History */}
          <ResizablePanel defaultSize={50} minSize={30}>
            <ResizablePanelGroup direction="vertical">
              {/* Results Panel */}
              <ResizablePanel defaultSize={70} minSize={40}>
                <div className="h-full p-4 overflow-y-auto">
                  <SQLResults
                    results={results || undefined}
                    error={error || undefined}
                    executionTime={executionTime || undefined}
                    rowCount={results?.length}
                    columnCount={results?.[0] ? Object.keys(results[0]).length : 0}
                    sql={currentSQL}
                    onRetry={() => executeSQL()}
                  />
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle />

              {/* History Panel */}
              <ResizablePanel defaultSize={30} minSize={20}>
                <div className="h-full flex flex-col">
                  <div className="border-b bg-gray-50 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-gray-600" />
                      <span className="font-medium">Query History</span>
                      <Badge variant="secondary" className="text-xs">
                        {queryHistory.length}
                      </Badge>
                    </div>

                    {queryHistory.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearHistory}
                        className="text-xs"
                      >
                        Clear
                      </Button>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto">
                    {queryHistory.length === 0 ? (
                      <div className="p-4 text-center text-gray-500">
                        <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No queries executed yet</p>
                      </div>
                    ) : (
                      <div className="p-2 space-y-2">
                        {queryHistory.map((item) => (
                          <Card
                            key={item.id}
                            className="cursor-pointer hover:bg-gray-50 transition-colors"
                            onClick={() => loadFromHistory(item)}
                          >
                            <CardContent className="p-3">
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  {item.success ? (
                                    <CheckCircle className="h-4 w-4 text-green-600" />
                                  ) : (
                                    <div className="h-4 w-4 rounded-full bg-red-100 flex items-center justify-center">
                                      <div className="h-2 w-2 rounded-full bg-red-600" />
                                    </div>
                                  )}
                                  <span className="text-xs text-gray-600">
                                    {item.timestamp.toLocaleTimeString()}
                                  </span>
                                </div>

                                {item.executionTime && (
                                  <Badge variant="outline" className="text-xs">
                                    {item.executionTime}ms
                                  </Badge>
                                )}
                              </div>

                              <div className="font-mono text-xs bg-gray-50 p-2 rounded truncate">
                                {item.sql}
                              </div>

                              {item.rowCount !== undefined && (
                                <div className="mt-2 text-xs text-gray-600">
                                  {item.rowCount} rows returned
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  )
}