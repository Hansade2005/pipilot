import { NextRequest, NextResponse } from 'next/server'
import { streamText, tool, stepCountIs } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getModel } from '@/lib/ai-providers'
import { DEFAULT_CHAT_MODEL, getModelById } from '@/lib/ai-models'

// In-memory session storage for activity chat
const activitySessionStorage = new Map<string, {
  fileTree: string[]
  files: Map<string, any>
}>()

function getActivityModel(modelId?: string) {
  try {
    const selectedModelId = modelId || DEFAULT_CHAT_MODEL
    const modelInfo = getModelById(selectedModelId)
    if (!modelInfo) {
      return getModel(DEFAULT_CHAT_MODEL)
    }
    return getModel(selectedModelId)
  } catch {
    return getModel(DEFAULT_CHAT_MODEL)
  }
}

// Build project context from session data
function buildProjectContext(projectId: string): string {
  const sessionData = activitySessionStorage.get(projectId)
  if (!sessionData) return ''

  const { files, fileTree } = sessionData
  const fileList = Array.from(files.values())
    .filter((f: any) => !f.isDirectory)
    .filter((f: any) => {
      const p = f.path?.toLowerCase() || ''
      return !p.includes('node_modules') && !p.includes('.git/') && !p.includes('.next/')
    })

  const tree = fileTree.length > 0
    ? fileTree.slice(0, 200).join('\n')
    : fileList.map((f: any) => f.path).join('\n')

  return `# Project Files\n\`\`\`\n${tree}\n\`\`\`\n\nTotal files: ${fileList.length}`
}

// Construct tool result from session storage
function constructToolResult(toolName: string, input: any, projectId: string) {
  const sessionData = activitySessionStorage.get(projectId)
  if (!sessionData) {
    return { success: false, error: `No session data for project ${projectId}` }
  }
  const { files: sessionFiles } = sessionData

  switch (toolName) {
    case 'write_file': {
      const { path, content } = input
      if (!path || content === undefined) {
        return { success: false, error: 'Invalid path or content' }
      }
      const existing = sessionFiles.get(path)
      if (existing) {
        existing.content = String(content)
        existing.size = content.length
        return { success: true, message: `File ${path} updated successfully.`, path, content, action: 'updated' }
      }
      sessionFiles.set(path, {
        workspaceId: projectId,
        name: path.split('/').pop() || path,
        path,
        content: String(content),
        fileType: path.split('.').pop() || 'text',
        type: path.split('.').pop() || 'text',
        size: content.length,
        isDirectory: false,
      })
      return { success: true, message: `File ${path} created successfully.`, path, content, action: 'created' }
    }

    case 'read_file': {
      const { path, startLine, endLine, lineRange } = input
      const file = sessionFiles.get(path)
      if (!file) return { success: false, error: `File not found: ${path}` }

      let content = file.content || ''
      let actualStart = startLine
      let actualEnd = endLine

      if (lineRange && typeof lineRange === 'string') {
        const match = lineRange.match(/^(\d+)-(\d+)$/)
        if (match) {
          actualStart = parseInt(match[1], 10)
          actualEnd = parseInt(match[2], 10)
        }
      }

      if (actualStart && actualStart > 0) {
        const lines = content.split('\n')
        const si = actualStart - 1
        const ei = actualEnd ? Math.min(actualEnd - 1, lines.length - 1) : lines.length - 1
        content = lines.slice(si, ei + 1).join('\n')
      }

      const totalLines = (file.content || '').split('\n').length
      if (!actualStart && totalLines > 200) {
        content = (file.content || '').split('\n').slice(0, 200).join('\n')
        return { success: true, path, content, totalLines, truncated: true, message: `Showing first 200 of ${totalLines} lines. Use lineRange for specific sections.` }
      }

      return { success: true, path, content, totalLines }
    }

    case 'edit_file': {
      const { filePath, searchReplaceBlock, replaceAll = false } = input
      const file = sessionFiles.get(filePath)
      if (!file) return { success: false, error: `File not found: ${filePath}` }

      const searchMatch = searchReplaceBlock.match(/<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/)
      if (!searchMatch) {
        return { success: false, error: 'Invalid search/replace block format' }
      }

      const [, searchStr, replaceStr] = searchMatch
      const content = file.content || ''

      if (!content.includes(searchStr)) {
        return { success: false, error: `Search string not found in ${filePath}`, searchStr: searchStr.substring(0, 100) }
      }

      const newContent = replaceAll
        ? content.split(searchStr).join(replaceStr)
        : content.replace(searchStr, replaceStr)

      file.content = newContent
      file.size = newContent.length

      return { success: true, message: `File ${filePath} edited successfully.`, filePath, action: 'edited' }
    }

    case 'delete_file': {
      const { path } = input
      if (!sessionFiles.has(path)) {
        return { success: false, error: `File not found: ${path}` }
      }
      sessionFiles.delete(path)
      return { success: true, message: `File ${path} deleted.`, path }
    }

    case 'list_files': {
      const { path: dirPath } = input
      const prefix = dirPath ? (dirPath.endsWith('/') ? dirPath : dirPath + '/') : ''
      const matchingFiles = Array.from(sessionFiles.values())
        .filter((f: any) => prefix ? f.path.startsWith(prefix) : true)
        .map((f: any) => ({
          path: f.path,
          type: f.isDirectory ? 'directory' : 'file',
          size: f.size || 0,
        }))
      return { success: true, files: matchingFiles, count: matchingFiles.length }
    }

    case 'grep_search': {
      const { pattern, path: searchPath, caseSensitive = false } = input
      try {
        const flags = caseSensitive ? 'g' : 'gi'
        const regex = new RegExp(pattern, flags)
        const results: any[] = []

        for (const [filePath, file] of sessionFiles.entries()) {
          if (file.isDirectory || !file.content) continue
          if (searchPath && !filePath.startsWith(searchPath)) continue

          const lines = file.content.split('\n')
          lines.forEach((line: string, idx: number) => {
            regex.lastIndex = 0
            if (regex.test(line)) {
              results.push({
                filePath,
                lineNumber: idx + 1,
                lineContent: line.trim().substring(0, 200),
              })
            }
          })
        }

        return { success: true, results: results.slice(0, 50), totalMatches: results.length }
      } catch {
        return { success: false, error: `Invalid regex pattern: ${pattern}` }
      }
    }

    default:
      return { success: false, error: `Unknown tool: ${toolName}` }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      messages,
      projectId,
      modelId,
      clientFiles = [],
      clientFileTree = [],
      fileContexts = [],
      codebaseContext,
    } = body

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages are required' }, { status: 400 })
    }

    // Auth check
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Initialize session storage if not present or if new files sent
    if (projectId && (clientFiles.length > 0 || !activitySessionStorage.has(projectId))) {
      const sessionFiles = new Map<string, any>()

      for (const file of clientFiles) {
        if (file.path && !file.isDirectory) {
          sessionFiles.set(file.path, {
            workspaceId: projectId,
            name: file.name,
            path: file.path,
            content: file.content !== undefined ? String(file.content) : '',
            fileType: file.type || file.fileType || 'text',
            type: file.type || file.fileType || 'text',
            size: file.size || String(file.content || '').length,
            isDirectory: false,
          })
        }
      }

      // Merge with existing session if present
      const existing = activitySessionStorage.get(projectId)
      if (existing) {
        // Keep existing files, update with new ones
        for (const [path, data] of existing.files) {
          if (!sessionFiles.has(path)) {
            sessionFiles.set(path, data)
          }
        }
      }

      activitySessionStorage.set(projectId, {
        fileTree: clientFileTree.length > 0 ? clientFileTree : (existing?.fileTree || []),
        files: sessionFiles,
      })
    }

    const model = getActivityModel(modelId)
    const projectContext = projectId ? buildProjectContext(projectId) : ''

    // Build file contexts string
    let fileContextStr = ''
    if (fileContexts.length > 0) {
      fileContextStr = '\n\n# Attached File Contents\n'
      for (const ctx of fileContexts) {
        if (ctx.type === 'file' && ctx.content) {
          fileContextStr += `\n## ${ctx.path}\n\`\`\`\n${ctx.content.substring(0, 10000)}\n\`\`\`\n`
        } else if (ctx.type === 'folder' && ctx.tree) {
          fileContextStr += `\n## Folder: ${ctx.path}\n\`\`\`\n${ctx.tree}\n\`\`\`\n`
        }
      }
    }

    // Build codebase context if @codebase was used
    let codebaseStr = ''
    if (codebaseContext && projectId) {
      const sessionData = activitySessionStorage.get(projectId)
      if (sessionData) {
        const files = Array.from(sessionData.files.values())
          .filter((f: any) => !f.isDirectory && f.content)
          .filter((f: any) => {
            const p = f.path?.toLowerCase() || ''
            return !p.includes('node_modules') && !p.includes('.git/')
          })

        // Build a semantic summary of important files
        const importantExts = ['.tsx', '.ts', '.jsx', '.js', '.py', '.css', '.json']
        const importantFiles = files
          .filter((f: any) => importantExts.some(ext => f.path.endsWith(ext)))
          .slice(0, 30)

        codebaseStr = '\n\n# Full Codebase Context\n'
        for (const file of importantFiles) {
          const content = (file.content || '').substring(0, 3000)
          codebaseStr += `\n## ${file.path}\n\`\`\`\n${content}\n\`\`\`\n`
        }
      }
    }

    const systemPrompt = `You are PiPilot Code Assistant - an AI coding assistant embedded in the code editor sidebar. You help users understand, write, and modify code in their projects.

${projectContext}${fileContextStr}${codebaseStr}

## Your Capabilities
- Read, write, edit, and delete project files using tools
- Search across the codebase with grep
- List files and directories
- Explain code, find bugs, suggest improvements
- Generate new code and modify existing code

## Guidelines
- Be concise and direct in your responses
- When modifying files, use the appropriate file tools
- Always read a file before editing it
- Provide code in markdown code blocks with language tags
- Focus on the user's specific question or task
- When creating or editing files, the changes are applied to the project in real-time`

    // Build tools
    const tools: Record<string, any> = projectId ? {
      write_file: tool({
        description: 'Create or update a file in the project.',
        inputSchema: z.object({
          path: z.string().describe('File path relative to project root'),
          content: z.string().describe('Complete file content'),
        }),
        execute: async ({ path, content }) => {
          return constructToolResult('write_file', { path, content }, projectId)
        },
      }),

      read_file: tool({
        description: 'Read file contents. Use lineRange for large files.',
        inputSchema: z.object({
          path: z.string().describe('File path to read'),
          startLine: z.number().optional().describe('Starting line (1-indexed)'),
          endLine: z.number().optional().describe('Ending line (1-indexed)'),
          lineRange: z.string().optional().describe('Line range like "1-50"'),
        }),
        execute: async ({ path, startLine, endLine, lineRange }) => {
          return constructToolResult('read_file', { path, startLine, endLine, lineRange }, projectId)
        },
      }),

      edit_file: tool({
        description: 'Edit a file using search/replace blocks.',
        inputSchema: z.object({
          filePath: z.string().describe('File path relative to project root'),
          searchReplaceBlock: z.string().describe('Search/replace in format: <<<<<<< SEARCH\\n[find]\\n=======\\n[replace]\\n>>>>>>> REPLACE'),
          replaceAll: z.boolean().optional().describe('Replace all occurrences'),
        }),
        execute: async ({ filePath, searchReplaceBlock, replaceAll }) => {
          return constructToolResult('edit_file', { filePath, searchReplaceBlock, replaceAll }, projectId)
        },
      }),

      delete_file: tool({
        description: 'Delete a file from the project.',
        inputSchema: z.object({
          path: z.string().describe('File path to delete'),
        }),
        execute: async ({ path }) => {
          return constructToolResult('delete_file', { path }, projectId)
        },
      }),

      list_files: tool({
        description: 'List files in a directory.',
        inputSchema: z.object({
          path: z.string().optional().describe('Directory path (empty for root)'),
        }),
        execute: async ({ path }) => {
          return constructToolResult('list_files', { path }, projectId)
        },
      }),

      grep_search: tool({
        description: 'Search for patterns across project files.',
        inputSchema: z.object({
          pattern: z.string().describe('Search pattern (regex supported)'),
          path: z.string().optional().describe('Directory to search in'),
          caseSensitive: z.boolean().optional().describe('Case-sensitive search'),
        }),
        execute: async ({ pattern, path, caseSensitive }) => {
          return constructToolResult('grep_search', { pattern, path, caseSensitive }, projectId)
        },
      }),
    } : {}

    // Process messages - prepend context to first user message
    const processedMessages = messages.map((msg: any, idx: number) => {
      if (msg.role === 'user' && idx === 0 && projectContext) {
        const text = typeof msg.content === 'string' ? msg.content : msg.content
        return { ...msg, content: text }
      }
      return msg
    }).slice(-10) // Keep last 10 messages

    const messagesWithSystem = [
      { role: 'system' as const, content: systemPrompt },
      ...processedMessages,
    ]

    const result = await streamText({
      model,
      temperature: 0.5,
      messages: messagesWithSystem,
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      ...(Object.keys(tools).length > 0 ? { stopWhen: stepCountIs(5) } : {}),
    })

    // Stream using newline-delimited JSON (same format as chat-v2)
    return new Response(
      new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder()
          try {
            for await (const part of result.fullStream) {
              if (part.type === 'text-delta') {
                controller.enqueue(encoder.encode(JSON.stringify({
                  type: 'text-delta',
                  textDelta: (part as any).textDelta || (part as any).text || '',
                }) + '\n'))
              } else if (part.type === 'tool-call') {
                controller.enqueue(encoder.encode(JSON.stringify({
                  type: 'tool-call',
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  args: (part as any).args || (part as any).input || {},
                }) + '\n'))
              } else if (part.type === 'tool-result') {
                controller.enqueue(encoder.encode(JSON.stringify({
                  type: 'tool-result',
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  result: (part as any).result || (part as any).output || {},
                }) + '\n'))
              } else if (part.type === 'finish') {
                controller.enqueue(encoder.encode(JSON.stringify({
                  type: 'finish',
                  finishReason: part.finishReason,
                }) + '\n'))
              }
            }
          } catch (error) {
            console.error('[Activity Chat] Stream error:', error)
            controller.enqueue(encoder.encode(JSON.stringify({
              type: 'error',
              error: error instanceof Error ? error.message : 'Stream error',
            }) + '\n'))
          } finally {
            controller.close()
          }
        },
      }),
      {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      }
    )
  } catch (error) {
    console.error('[Activity Chat] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
