"use client"

import React, { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Server,
  Send,
  Plus,
  Trash2,
  Terminal,
  Wifi,
  X,
  Loader2,
  Bot,
  User,
  Wrench,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Zap,
  AlertCircle,
} from "lucide-react"

interface MCPServer {
  id: string
  name: string
  url: string
  transport: 'http' | 'sse'
  headers: Record<string, string>
  apiKey: string
  enabled: boolean
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: Array<{
    name: string
    args: any
    result?: any
  }>
}

export default function MCPTestPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([])
  const [showAddServer, setShowAddServer] = useState(false)
  const [newServer, setNewServer] = useState<Partial<MCPServer>>({
    name: '',
    url: '',
    transport: 'http',
    headers: {},
    apiKey: '',
    enabled: true,
  })
  const [newHeaderKey, setNewHeaderKey] = useState('')
  const [newHeaderValue, setNewHeaderValue] = useState('')
  const [expandedToolCalls, setExpandedToolCalls] = useState<Record<string, boolean>>({})
  const [copied, setCopied] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  // Load saved servers from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('pipilot-mcp-test-servers')
    if (stored) {
      try { setMcpServers(JSON.parse(stored)) } catch {}
    }
  }, [])

  const saveMCPServers = (servers: MCPServer[]) => {
    setMcpServers(servers)
    localStorage.setItem('pipilot-mcp-test-servers', JSON.stringify(servers))
  }

  const addServer = () => {
    if (!newServer.name || !newServer.url) return
    const server: MCPServer = {
      id: crypto.randomUUID(),
      name: newServer.name!,
      url: newServer.url!,
      transport: newServer.transport || 'http',
      headers: newServer.headers || {},
      apiKey: newServer.apiKey || '',
      enabled: true,
    }
    saveMCPServers([...mcpServers, server])
    setNewServer({ name: '', url: '', transport: 'http', headers: {}, apiKey: '', enabled: true })
    setShowAddServer(false)
  }

  const removeServer = (id: string) => {
    saveMCPServers(mcpServers.filter(s => s.id !== id))
  }

  const toggleServer = (id: string) => {
    saveMCPServers(mcpServers.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s))
  }

  const addHeader = () => {
    if (newHeaderKey && newHeaderValue) {
      setNewServer(prev => ({ ...prev, headers: { ...prev.headers, [newHeaderKey]: newHeaderValue } }))
      setNewHeaderKey('')
      setNewHeaderValue('')
    }
  }

  const removeHeader = (key: string) => {
    setNewServer(prev => {
      const h = { ...prev.headers }
      delete h[key]
      return { ...prev, headers: h }
    })
  }

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setIsLoading(true)
    setStreamingContent('')

    try {
      const enabledServers = mcpServers.filter(s => s.enabled)
      const response = await fetch('/api/mcp-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          mcpServers: enabledServers.map(s => ({
            name: s.name,
            url: s.url,
            transport: s.transport,
            headers: s.headers,
            apiKey: s.apiKey || undefined,
          })),
        }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(errData.error || `HTTP ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let fullContent = ''
      const toolCalls: Message['toolCalls'] = []
      let lineBuffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        lineBuffer += decoder.decode(value, { stream: true })
        const lines = lineBuffer.split('\n')
        lineBuffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue

          // AI SDK data stream protocol parsing
          const colonIdx = line.indexOf(':')
          if (colonIdx === -1) continue

          const type = line.substring(0, colonIdx)
          const data = line.substring(colonIdx + 1)

          try {
            switch (type) {
              case '0': // text delta
                const text = JSON.parse(data)
                fullContent += text
                setStreamingContent(fullContent)
                break
              case '9': // tool call
                const toolCall = JSON.parse(data)
                toolCalls.push({
                  name: toolCall.toolName,
                  args: toolCall.args,
                })
                break
              case 'a': // tool result
                const toolResult = JSON.parse(data)
                const matchingCall = toolCalls.find(tc => !tc.result)
                if (matchingCall) {
                  matchingCall.result = toolResult.result
                }
                break
              case 'e': // error
                const error = JSON.parse(data)
                fullContent += `\n\nError: ${error.message || JSON.stringify(error)}`
                setStreamingContent(fullContent)
                break
              case 'd': // done
                break
            }
          } catch {}
        }
      }

      // Add the assistant message
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: fullContent || 'No response generated.',
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        },
      ])
      setStreamingContent('')
    } catch (error) {
      console.error('[MCP-Test] Error:', error)
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `Error: ${error instanceof Error ? error.message : 'Failed to get response'}`,
        },
      ])
      setStreamingContent('')
    } finally {
      setIsLoading(false)
    }
  }

  const copyConfig = () => {
    const config: Record<string, any> = {}
    mcpServers.forEach(s => {
      config[s.name] = {
        url: s.url,
        ...(Object.keys(s.headers).length > 0 ? { headers: s.headers } : {}),
      }
    })
    navigator.clipboard.writeText(JSON.stringify({ mcpServers: config }, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const enabledCount = mcpServers.filter(s => s.enabled).length

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10">
              <Zap className="h-5 w-5 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">MCP Test Playground</h1>
              <p className="text-xs text-gray-500">Devstral 2 + Model Context Protocol</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-xs ${enabledCount > 0 ? 'border-green-500/30 text-green-400 bg-green-500/5' : 'border-gray-700 text-gray-400'}`}>
              <Server className="h-3 w-3 mr-1" />
              {enabledCount} server{enabledCount !== 1 ? 's' : ''}
            </Badge>
            {mcpServers.length > 0 && (
              <Button variant="outline" size="sm" onClick={copyConfig} className="h-7 text-xs bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800">
                {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                {copied ? 'Copied' : 'Config'}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row max-w-7xl mx-auto w-full">
        {/* Sidebar - MCP Servers */}
        <div className="lg:w-80 border-b lg:border-b-0 lg:border-r border-gray-800 p-4 lg:p-5 space-y-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">MCP Servers</h2>
            <Button size="sm" onClick={() => setShowAddServer(!showAddServer)} className="h-7 text-xs bg-indigo-600 hover:bg-indigo-500">
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add
            </Button>
          </div>

          {/* Add Server Form */}
          {showAddServer && (
            <div className="p-4 bg-gray-900 border border-gray-800 rounded-xl space-y-3">
              <div>
                <Label className="text-xs text-gray-400 mb-1 block">Name</Label>
                <Input
                  value={newServer.name}
                  onChange={(e) => setNewServer(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="my-server"
                  className="bg-gray-800 border-gray-700 text-white text-sm h-8 font-mono"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-400 mb-1 block">URL</Label>
                <Input
                  value={newServer.url}
                  onChange={(e) => setNewServer(prev => ({ ...prev, url: e.target.value }))}
                  placeholder="https://mcp.example.com/mcp"
                  className="bg-gray-800 border-gray-700 text-white text-sm h-8 font-mono"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-400 mb-1 block">Transport</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setNewServer(prev => ({ ...prev, transport: 'http' }))}
                    className={`p-2 rounded-lg border text-xs font-medium transition-colors ${newServer.transport === 'http' ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400' : 'border-gray-700 text-gray-400 hover:border-gray-600'}`}
                  >
                    HTTP
                  </button>
                  <button
                    onClick={() => setNewServer(prev => ({ ...prev, transport: 'sse' }))}
                    className={`p-2 rounded-lg border text-xs font-medium transition-colors ${newServer.transport === 'sse' ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400' : 'border-gray-700 text-gray-400 hover:border-gray-600'}`}
                  >
                    SSE
                  </button>
                </div>
              </div>
              <div>
                <Label className="text-xs text-gray-400 mb-1 block">API Key (optional)</Label>
                <Input
                  value={newServer.apiKey}
                  onChange={(e) => setNewServer(prev => ({ ...prev, apiKey: e.target.value }))}
                  placeholder="Bearer token"
                  type="password"
                  className="bg-gray-800 border-gray-700 text-white text-sm h-8 font-mono"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-400 mb-1 block">Headers</Label>
                {newServer.headers && Object.keys(newServer.headers).length > 0 && (
                  <div className="space-y-1 mb-2">
                    {Object.entries(newServer.headers).map(([k]) => (
                      <div key={k} className="flex items-center justify-between px-2 py-1 bg-gray-800/50 rounded text-xs">
                        <code className="text-indigo-400 font-mono">{k}</code>
                        <button onClick={() => removeHeader(k)} className="text-gray-600 hover:text-red-400">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-1.5">
                  <Input value={newHeaderKey} onChange={(e) => setNewHeaderKey(e.target.value)} placeholder="Key" className="bg-gray-800 border-gray-700 text-white text-xs h-7 font-mono flex-1" />
                  <Input value={newHeaderValue} onChange={(e) => setNewHeaderValue(e.target.value)} placeholder="Value" type="password" className="bg-gray-800 border-gray-700 text-white text-xs h-7 font-mono flex-1" />
                  <Button variant="outline" size="sm" onClick={addHeader} className="h-7 px-2 bg-transparent border-gray-700 text-gray-300"><Plus className="h-3 w-3" /></Button>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setShowAddServer(false)} className="flex-1 h-8 text-xs bg-transparent border-gray-700 text-gray-300">Cancel</Button>
                <Button size="sm" onClick={addServer} className="flex-1 h-8 text-xs bg-indigo-600 hover:bg-indigo-500">Add Server</Button>
              </div>
            </div>
          )}

          {/* Server List */}
          {mcpServers.length > 0 ? (
            <div className="space-y-2">
              {mcpServers.map((server) => (
                <div key={server.id} className="flex items-center gap-3 p-3 bg-gray-900 border border-gray-800 rounded-lg">
                  <div className={`p-1.5 rounded-md ${server.enabled ? 'bg-green-500/10' : 'bg-gray-800'}`}>
                    <Wifi className={`h-3.5 w-3.5 ${server.enabled ? 'text-green-400' : 'text-gray-500'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{server.name}</p>
                    <p className="text-[10px] text-gray-500 truncate font-mono">{server.url}</p>
                  </div>
                  <Switch checked={server.enabled} onCheckedChange={() => toggleServer(server.id)} />
                  <button onClick={() => removeServer(server.id)} className="text-gray-600 hover:text-red-400 p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <Server className="h-8 w-8 text-gray-700 mx-auto mb-2" />
              <p className="text-xs text-gray-500">No servers configured</p>
              <p className="text-xs text-gray-600 mt-1">Add remote MCP servers to extend AI tools</p>
            </div>
          )}

          {/* Built-in Tools Info */}
          <div className="p-3 bg-gray-900/50 border border-gray-800/50 rounded-lg">
            <p className="text-xs font-medium text-gray-400 mb-2 flex items-center gap-1.5">
              <Wrench className="h-3 w-3" />
              Built-in Test Tools
            </p>
            <div className="space-y-1">
              <div className="text-xs text-gray-500"><code className="text-indigo-400">get_current_time</code> - Get current date/time</div>
              <div className="text-xs text-gray-500"><code className="text-indigo-400">calculate</code> - Math calculations</div>
            </div>
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">
            {messages.length === 0 && !streamingContent && (
              <div className="flex flex-col items-center justify-center h-full text-center py-20">
                <div className="p-4 rounded-2xl bg-gray-900/50 border border-gray-800/50 mb-4">
                  <Bot className="h-10 w-10 text-indigo-400" />
                </div>
                <h3 className="text-lg font-medium text-white mb-1">MCP Test Playground</h3>
                <p className="text-sm text-gray-500 max-w-md">
                  Chat with Devstral 2 and test MCP server integrations. Try asking about the time, math, or connect an MCP server for more tools.
                </p>
                <div className="flex flex-wrap gap-2 mt-6 justify-center">
                  {['What time is it?', 'Calculate 42 * 17', 'What tools do you have?'].map(q => (
                    <button
                      key={q}
                      onClick={() => { setInput(q); }}
                      className="px-3 py-1.5 text-xs bg-gray-900 border border-gray-800 rounded-full text-gray-400 hover:border-gray-700 hover:text-white transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.role === 'assistant' && (
                  <div className="p-2 rounded-lg bg-indigo-500/10 h-fit shrink-0">
                    <Bot className="h-4 w-4 text-indigo-400" />
                  </div>
                )}
                <div className={`max-w-[80%] ${msg.role === 'user' ? 'bg-indigo-600 rounded-2xl rounded-tr-sm px-4 py-2.5' : 'bg-gray-900 border border-gray-800 rounded-2xl rounded-tl-sm px-4 py-3'}`}>
                  {/* Tool Calls */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="mb-3 space-y-2">
                      {msg.toolCalls.map((tc, i) => {
                        const key = `${idx}-${i}`
                        const expanded = expandedToolCalls[key]
                        return (
                          <div key={i} className="bg-gray-800/50 border border-gray-700/50 rounded-lg overflow-hidden">
                            <button
                              onClick={() => setExpandedToolCalls(prev => ({ ...prev, [key]: !prev[key] }))}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-800/80 transition-colors"
                            >
                              <Wrench className="h-3 w-3 text-amber-400 shrink-0" />
                              <code className="text-amber-400 font-mono">{tc.name}</code>
                              <span className="text-gray-500 ml-auto">{expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}</span>
                            </button>
                            {expanded && (
                              <div className="px-3 pb-2 space-y-2 text-xs">
                                <div>
                                  <span className="text-gray-500">Input:</span>
                                  <pre className="mt-1 p-2 bg-gray-900 rounded text-gray-300 font-mono overflow-x-auto">{JSON.stringify(tc.args, null, 2)}</pre>
                                </div>
                                {tc.result !== undefined && (
                                  <div>
                                    <span className="text-gray-500">Output:</span>
                                    <pre className="mt-1 p-2 bg-gray-900 rounded text-green-400 font-mono overflow-x-auto">{JSON.stringify(tc.result, null, 2)}</pre>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <p className={`text-sm whitespace-pre-wrap ${msg.role === 'user' ? 'text-white' : 'text-gray-200'}`}>
                    {msg.content}
                  </p>
                </div>
                {msg.role === 'user' && (
                  <div className="p-2 rounded-lg bg-gray-800 h-fit shrink-0">
                    <User className="h-4 w-4 text-gray-400" />
                  </div>
                )}
              </div>
            ))}

            {/* Streaming indicator */}
            {streamingContent && (
              <div className="flex gap-3">
                <div className="p-2 rounded-lg bg-indigo-500/10 h-fit shrink-0">
                  <Bot className="h-4 w-4 text-indigo-400" />
                </div>
                <div className="max-w-[80%] bg-gray-900 border border-gray-800 rounded-2xl rounded-tl-sm px-4 py-3">
                  <p className="text-sm text-gray-200 whitespace-pre-wrap">{streamingContent}</p>
                </div>
              </div>
            )}

            {isLoading && !streamingContent && (
              <div className="flex gap-3">
                <div className="p-2 rounded-lg bg-indigo-500/10 h-fit">
                  <Bot className="h-4 w-4 text-indigo-400" />
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Thinking...
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-800 p-4">
            <div className="max-w-3xl mx-auto flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="Ask something... (try: 'What time is it?' or 'Calculate 123 * 456')"
                className="bg-gray-900 border-gray-800 text-white placeholder-gray-500 h-10 text-sm focus:border-indigo-500/50"
                disabled={isLoading}
              />
              <Button
                onClick={sendMessage}
                disabled={isLoading || !input.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 h-10 px-4"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-center text-[10px] text-gray-600 mt-2">
              Powered by Devstral 2 via Mistral AI
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
