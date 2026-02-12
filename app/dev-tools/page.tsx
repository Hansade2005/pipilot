'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, Database, MessageSquare, ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { usePageTitle } from '@/hooks/use-page-title'

interface Message {
  id: string
  chatSessionId: string
  role: string
  content: string
  createdAt: string
  metadata?: {
    toolInvocations?: any[]
    reasoning?: string
    hasToolCalls?: boolean
  }
}

export default function DevToolsPage() {
  usePageTitle('Developer Tools')
  const [sessions, setSessions] = useState<any[]>([])
  const [messages, setMessages] = useState<{ [sessionId: string]: Message[] }>({})
  const [loading, setLoading] = useState(false)
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set())
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set())
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      // Get user ID from Supabase session
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: { user }, error: userError } = await supabase.auth.getUser()

      if (userError || !user) {
        setError('Please log in to view chat data')
        setLoading(false)
        return
      }

      setUserId(user.id)

      const { storageManager } = await import('@/lib/storage-manager')
      await storageManager.init()

      // Get chat sessions for the current user
      const chatSessions = await storageManager.getChatSessions(user.id)
      setSessions(chatSessions)

      // Load messages for each session
      const messagesMap: { [sessionId: string]: Message[] } = {}
      for (const session of chatSessions) {
        const sessionMessages = await storageManager.getMessages(session.id)
        messagesMap[session.id] = sessionMessages
      }
      setMessages(messagesMap)
    } catch (error) {
      console.error('Error loading data:', error)
      setError('Failed to load chat data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(loadData, 2000) // Refresh every 2 seconds
      return () => clearInterval(interval)
    }
  }, [autoRefresh])

  const toggleSession = (sessionId: string) => {
    setExpandedSessions(prev => {
      const newSet = new Set(prev)
      if (newSet.has(sessionId)) {
        newSet.delete(sessionId)
      } else {
        newSet.add(sessionId)
      }
      return newSet
    })
  }

  const toggleMessage = (messageId: string) => {
    setExpandedMessages(prev => {
      const newSet = new Set(prev)
      if (newSet.has(messageId)) {
        newSet.delete(messageId)
      } else {
        newSet.add(messageId)
      }
      return newSet
    })
  }

  const clearAllData = async () => {
    if (!confirm('Are you sure you want to clear ALL chat data? This cannot be undone!')) {
      return
    }
    
    try {
      const { storageManager } = await import('@/lib/storage-manager')
      await storageManager.init()
      
      // Clear all data from IndexedDB
      await storageManager.clearAll()
      
      await loadData()
      alert('All chat data cleared!')
    } catch (error) {
      console.error('Error clearing data:', error)
      alert('Error clearing data. Check console.')
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Database className="w-8 h-8" />
              IndexedDB Inspector
            </h1>
            <p className="text-muted-foreground mt-2">
              Real-time chat session and message storage viewer
            </p>
          </div>
          
          <div className="flex gap-2">
            <Button
              variant={autoRefresh ? "default" : "outline"}
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
              {autoRefresh ? 'Auto-Refresh ON' : 'Auto-Refresh OFF'}
            </Button>
            <Button onClick={loadData} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh Now
            </Button>
            <Button onClick={clearAllData} variant="destructive">
              <Trash2 className="w-4 h-4 mr-2" />
              Clear All
            </Button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{sessions.length}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {sessions.filter(s => s.isActive).length}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Total Messages</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {Object.values(messages).reduce((sum, msgs) => sum + msgs.length, 0)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Error Message */}
        {error && (
          <Card className="border-destructive">
            <CardContent className="py-8 text-center">
              <p className="text-destructive font-medium mb-2">{error}</p>
              <p className="text-sm text-muted-foreground">
                {error.includes('log in') && 'Please log in to your account to access the dev tools.'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Sessions List */}
        <div className="space-y-4">
          {!error && sessions.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No chat sessions found. Start a conversation to see data here.
              </CardContent>
            </Card>
          ) : (
            sessions.map(session => (
              <Card key={session.id} className="overflow-hidden">
                <Collapsible
                  open={expandedSessions.has(session.id)}
                  onOpenChange={() => toggleSession(session.id)}
                >
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {expandedSessions.has(session.id) ? (
                            <ChevronDown className="w-5 h-5" />
                          ) : (
                            <ChevronRight className="w-5 h-5" />
                          )}
                          <MessageSquare className="w-5 h-5" />
                          <div className="text-left">
                            <CardTitle className="text-lg">{session.title}</CardTitle>
                            <CardDescription className="text-xs mt-1">
                              ID: {session.id}
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {session.isActive && (
                            <Badge variant="default">Active</Badge>
                          )}
                          <Badge variant="secondary">
                            {messages[session.id]?.length || 0} messages
                          </Badge>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                  </CardHeader>

                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <div className="grid grid-cols-2 gap-4 mb-4 p-4 bg-muted/30 rounded-lg">
                        <div>
                          <p className="text-xs text-muted-foreground">Session ID</p>
                          <p className="font-mono text-xs break-all">{session.id}</p>
                        </div>
                        {session.workspaceId && (
                          <div>
                            <p className="text-xs text-muted-foreground">Workspace ID</p>
                            <p className="font-mono text-xs break-all">{session.workspaceId}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-xs text-muted-foreground">User ID</p>
                          <p className="font-mono text-xs break-all">{session.userId || userId}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Created At</p>
                          <p className="text-sm">{formatDate(session.createdAt)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Last Message</p>
                          <p className="text-sm">{formatDate(session.lastMessageAt)}</p>
                        </div>
                      </div>

                      {/* Messages */}
                      <div className="space-y-3">
                        <h3 className="font-semibold text-sm mb-2">Messages ({messages[session.id]?.length || 0})</h3>
                        {messages[session.id]?.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No messages in this session</p>
                        ) : (
                          messages[session.id]?.map((message, idx) => (
                            <Card key={message.id} className="border-l-4" style={{
                              borderLeftColor: message.role === 'user' ? '#3b82f6' : '#10b981'
                            }}>
                              <Collapsible
                                open={expandedMessages.has(message.id)}
                                onOpenChange={() => toggleMessage(message.id)}
                              >
                                <CardHeader className="py-3 cursor-pointer hover:bg-muted/30 transition-colors">
                                  <CollapsibleTrigger className="w-full">
                                    <div className="flex items-center justify-between text-left">
                                      <div className="flex items-center gap-2">
                                        {expandedMessages.has(message.id) ? (
                                          <ChevronDown className="w-4 h-4" />
                                        ) : (
                                          <ChevronRight className="w-4 h-4" />
                                        )}
                                        <Badge variant={message.role === 'user' ? 'default' : 'secondary'}>
                                          {message.role}
                                        </Badge>
                                        <span className="text-sm font-mono text-muted-foreground">
                                          #{idx + 1}
                                        </span>
                                        {message.metadata?.hasToolCalls && (
                                          <Badge variant="outline" className="text-xs">
                                            🔧 {message.metadata.toolInvocations?.length || 0} tools
                                          </Badge>
                                        )}
                                        {message.metadata?.reasoning && (
                                          <Badge variant="outline" className="text-xs">
                                            🧠 Has reasoning
                                          </Badge>
                                        )}
                                      </div>
                                      <span className="text-xs text-muted-foreground">
                                        {formatDate(message.createdAt)}
                                      </span>
                                    </div>
                                  </CollapsibleTrigger>
                                </CardHeader>

                                <CollapsibleContent>
                                  <CardContent className="pt-0 space-y-4">
                                    {/* Message ID */}
                                    <div>
                                      <p className="text-xs font-semibold text-muted-foreground mb-1">Message ID</p>
                                      <p className="font-mono text-xs bg-muted p-2 rounded">{message.id}</p>
                                    </div>

                                    {/* Content */}
                                    <div>
                                      <p className="text-xs font-semibold text-muted-foreground mb-1">Content</p>
                                      <div className="bg-muted p-3 rounded max-h-40 overflow-y-auto">
                                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                                      </div>
                                    </div>

                                    {/* Tool Invocations */}
                                    {message.metadata?.toolInvocations && message.metadata.toolInvocations.length > 0 && (
                                      <div>
                                        <p className="text-xs font-semibold text-muted-foreground mb-2">
                                          🔧 Tool Invocations ({message.metadata.toolInvocations.length})
                                        </p>
                                        <div className="space-y-2">
                                          {message.metadata.toolInvocations.map((tool: any, toolIdx: number) => (
                                            <Card key={toolIdx} className="bg-muted/50">
                                              <CardContent className="p-3 space-y-2">
                                                <div className="flex items-center justify-between">
                                                  <Badge variant="outline">{tool.toolName}</Badge>
                                                  <Badge variant={
                                                    tool.state === 'result' 
                                                      ? (tool.result?.error ? 'destructive' : 'default')
                                                      : 'secondary'
                                                  }>
                                                    {tool.state === 'result' 
                                                      ? (tool.result?.error ? '❌ Failed' : '✅ Completed')
                                                      : '⏳ Executing'
                                                    }
                                                  </Badge>
                                                </div>
                                                <div>
                                                  <p className="text-xs font-semibold text-muted-foreground">Tool Call ID</p>
                                                  <p className="font-mono text-xs">{tool.toolCallId}</p>
                                                </div>
                                                {tool.args && (
                                                  <div>
                                                    <p className="text-xs font-semibold text-muted-foreground">Arguments</p>
                                                    <pre className="font-mono text-xs bg-background p-2 rounded overflow-x-auto">
                                                      {JSON.stringify(tool.args, null, 2)}
                                                    </pre>
                                                  </div>
                                                )}
                                                {tool.result && (
                                                  <div>
                                                    <p className="text-xs font-semibold text-muted-foreground">Result</p>
                                                    <pre className="font-mono text-xs bg-background p-2 rounded overflow-x-auto">
                                                      {JSON.stringify(tool.result, null, 2)}
                                                    </pre>
                                                  </div>
                                                )}
                                              </CardContent>
                                            </Card>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Reasoning */}
                                    {message.metadata?.reasoning && (
                                      <div>
                                        <p className="text-xs font-semibold text-muted-foreground mb-1">🧠 Reasoning</p>
                                        <div className="bg-muted p-3 rounded max-h-40 overflow-y-auto">
                                          <p className="text-sm whitespace-pre-wrap">{message.metadata.reasoning}</p>
                                        </div>
                                      </div>
                                    )}

                                    {/* Full Metadata */}
                                    <details className="text-xs">
                                      <summary className="cursor-pointer font-semibold text-muted-foreground mb-1">
                                        Full Metadata (JSON)
                                      </summary>
                                      <pre className="font-mono text-xs bg-background p-3 rounded overflow-x-auto mt-2">
                                        {JSON.stringify(message.metadata, null, 2)}
                                      </pre>
                                    </details>
                                  </CardContent>
                                </CollapsibleContent>
                              </Collapsible>
                            </Card>
                          ))
                        )}
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
