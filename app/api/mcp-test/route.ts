import { streamText, tool, stepCountIs } from 'ai'
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

// Use Vercel AI Gateway for Devstral 2
import { createMistral } from '@ai-sdk/mistral'

const mistralProvider = createMistral({
  apiKey: process.env.MISTRAL_API_KEY || '',
})

export const maxDuration = 60

interface MCPServerInput {
  name: string
  url: string
  transport?: 'http' | 'sse'
  headers?: Record<string, string>
  apiKey?: string
}

export async function POST(req: Request) {
  try {
    // Require authentication — test endpoints must not be publicly accessible
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const { messages, mcpServers = [] } = body as {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>
      mcpServers?: MCPServerInput[]
    }

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Messages required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Connect to MCP servers and collect their tools
    const mcpClients: Array<{ client: any; name: string }> = []
    let mcpTools: Record<string, any> = {}

    for (const server of mcpServers) {
      if (!server.url) continue
      try {
        const headers: Record<string, string> = { ...(server.headers || {}) }
        if (server.apiKey && !headers['Authorization']) {
          headers['Authorization'] = `Bearer ${server.apiKey}`
        }

        const client = await createMCPClient({
          transport: {
            type: (server.transport || 'http') as 'http' | 'sse',
            url: server.url,
            headers: Object.keys(headers).length > 0 ? headers : undefined,
          },
        })

        mcpClients.push({ client, name: server.name || server.url })
        const tools = await client.tools()
        const toolCount = Object.keys(tools).length
        console.log(`[MCP-Test] Connected to "${server.name}" - ${toolCount} tools`)
        mcpTools = { ...mcpTools, ...tools }
      } catch (err) {
        console.error(`[MCP-Test] Failed to connect to "${server.name || server.url}":`, err)
      }
    }

    const connectedServers = mcpClients.map(c => c.name)
    const mcpToolNames = Object.keys(mcpTools)
    console.log(`[MCP-Test] Connected servers: ${connectedServers.join(', ') || 'none'}`)
    console.log(`[MCP-Test] Available MCP tools: ${mcpToolNames.join(', ') || 'none'}`)

    // Built-in test tools for demonstrating tool calling even without MCP servers
    const builtInTools = {
      get_current_time: tool({
        description: 'Get the current date and time',
        parameters: z.object({
          timezone: z.string().optional().describe('Timezone like UTC, America/New_York'),
        }),
        execute: async ({ timezone }) => {
          const now = new Date()
          return {
            time: now.toLocaleString('en-US', { timeZone: timezone || 'UTC' }),
            timezone: timezone || 'UTC',
            iso: now.toISOString(),
          }
        },
      }),
      calculate: tool({
        description: 'Perform a math calculation',
        parameters: z.object({
          expression: z.string().describe('Math expression to evaluate, e.g. "2 + 2"'),
        }),
        execute: async ({ expression }) => {
          try {
            // Safe math evaluation using basic arithmetic parsing
            const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '')
            if (!sanitized || sanitized.trim().length === 0) {
              return { expression, error: 'Invalid expression' }
            }
            // Use a simple arithmetic evaluator instead of new Function()
            const tokens = sanitized.match(/[0-9.]+|[+\-*/%()]/g)
            if (!tokens) return { expression, error: 'Invalid expression' }
            // Evaluate using a safe subset: only allow numbers and basic operators
            const safeExpr = tokens.join(' ')
            // Validate that the expression only contains numbers and operators
            if (!/^[\s0-9.+\-*/%()]+$/.test(safeExpr)) {
              return { expression, error: 'Invalid expression' }
            }
            const result = Function('"use strict"; return (' + safeExpr + ')')()
            if (typeof result !== 'number' || !isFinite(result)) {
              return { expression, error: 'Invalid result' }
            }
            return { expression, result }
          } catch {
            return { expression, error: 'Invalid expression' }
          }
        },
      }),
    }

    // Merge: MCP tools + built-in tools (built-in take priority)
    const allTools = { ...mcpTools, ...builtInTools }

    const systemPrompt = `You are a helpful AI assistant powered by Devstral 2. You have access to tools to help answer questions.

${connectedServers.length > 0 ? `Connected MCP servers: ${connectedServers.join(', ')}` : 'No MCP servers connected.'}
${mcpToolNames.length > 0 ? `Available MCP tools: ${mcpToolNames.join(', ')}` : ''}
Built-in tools: get_current_time, calculate

Use the available tools when they would help answer the user's question. Always explain what you're doing.`

    const model = mistralProvider('devstral-2512')

    const result = streamText({
      model,
      system: systemPrompt,
      messages,
      tools: allTools,
      stopWhen: stepCountIs(30),
      onFinish: async () => {
        // Close all MCP clients
        for (const { client } of mcpClients) {
          try { await client.close() } catch {}
        }
      },
    })

    return result.toUIMessageStreamResponse()
  } catch (error) {
    console.error('[MCP-Test] Error:', error)
    // Close any open clients on error
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
