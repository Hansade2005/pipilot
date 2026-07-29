import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText, tool } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

// Create the AI client
const createAIClient = () => {
  return createOpenAICompatible({
    name: 'codestral',
    baseURL: 'https://codestral.mistral.ai/v1',
    apiKey: process.env.MISTRAL_API_KEY || '',
  })
}

export async function POST(req: Request) {
  try {
    // Require authentication — debug endpoints must not be publicly accessible
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const { testMessage = "use tools to list files" } = body
    
    const codestral = createAIClient()
    
    // Ultra-simple system message focused only on tool usage
    const systemMessage = `You are a helpful AI assistant with file operation tools.

CRITICAL: When users ask about files, you MUST use the available tools:
- To list files: use list_files
- To read a file: use read_file  
- To create/write a file: use write_file

NEVER refuse to use tools. ALWAYS use the appropriate tool for file operations.

IMPORTANT: This is a Vite React project - use ONLY relative imports:
- CORRECT: import { Button } from './ui/button'
- WRONG: import { Button } from '@/components/ui/button'

Available tools: list_files, read_file, write_file`

    const result = await generateText({
      model: codestral('codestral-latest'),
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: testMessage }
      ],
      temperature: 0.0,
      toolChoice: 'required', // Force tool usage
      tools: {
        list_files: tool({
          description: 'List all files in the project',
          inputSchema: z.object({}),
          execute: async () => {
            console.log('[DEBUG-TOOLS] list_files tool executed!')
            return { 
              success: true, 
              message: "✅ Tool executed successfully!",
              files: ['test.js', 'app.js', 'package.json'],
              action: 'list'
            }
          }
        }),
        read_file: tool({
          description: 'Read the contents of a file',
          inputSchema: z.object({
            path: z.string().describe('File path to read')
          }),
          execute: async ({ path }) => {
            console.log('[DEBUG-TOOLS] read_file tool executed for:', path)
            return { 
              success: true, 
              message: `✅ File ${path} read successfully!`,
              content: `// Content of ${path}\nconsole.log('Hello World');`,
              action: 'read'
            }
          }
        }),
        write_file: tool({
          description: 'Create or update a file',
          inputSchema: z.object({
            path: z.string().describe('File path'),
            content: z.string().describe('File content')
          }),
          execute: async ({ path, content }) => {
            console.log('[DEBUG-TOOLS] write_file tool executed for:', path)
            return { 
              success: true, 
              message: `✅ File ${path} created successfully!`,
              action: 'write'
            }
          }
        })
      }
    })

    // Check results - using correct property names from AI SDK
    const toolCalls = result.steps?.flatMap(step => step.toolCalls) || []
    const toolResults = result.steps?.flatMap(step => step.toolResults) || []
    
    console.log('[DEBUG-TOOLS] Results:', {
      hasText: !!result.text,
      textContent: result.text,
      toolCallsCount: toolCalls.length,
      toolResultsCount: toolResults.length,
      steps: result.steps?.length || 0
    })

    return new Response(JSON.stringify({
      success: true,
      testMessage,
      aiResponse: result.text,
      toolsUsed: toolCalls.length > 0,
      toolCallsCount: toolCalls.length,
      toolResultsCount: toolResults.length,
      toolCalls: toolCalls.map((tc, index) => ({
        id: tc.toolCallId,
        name: tc.toolName,
        // Extract arguments safely without type issues
        arguments: tc.toolName === 'list_files' ? {} : 
                  tc.toolName === 'read_file' ? { path: '[extracted from call]' } :
                  tc.toolName === 'write_file' ? { path: '[extracted from call]', content: '[extracted from call]' } : {},
        executed: true
      })),
      toolResults: toolResults.map((tr, index) => ({
        id: tr.toolCallId,
        name: tr.toolName,
        success: true,
        message: 'Tool executed successfully'
      })),
      steps: result.steps?.map((step, index) => ({
        stepNumber: index + 1,
        hasText: !!step.text,
        toolCallsInStep: step.toolCalls?.length || 0,
        toolResultsInStep: step.toolResults?.length || 0
      })),
      diagnosis: {
        modelResponded: !!result.text,
        toolsExecuted: toolResults.length > 0,
        expectedBehavior: 'AI should use tools when asked about files',
        actualBehavior: toolResults.length > 0 ? 'AI used tools correctly' : 'AI did not use tools'
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('[DEBUG-TOOLS] Error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: 'Tool debugging failed'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
