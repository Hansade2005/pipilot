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

// Helper: Normalize file path by stripping leading ./ and / and collapsing double slashes
function normalizeFilePath(filePath: string): string {
  let normalized = filePath
  while (normalized.startsWith('./')) normalized = normalized.slice(2)
  while (normalized.startsWith('/')) normalized = normalized.slice(1)
  normalized = normalized.replace(/\/+/g, '/')
  if (normalized.endsWith('/') && normalized.length > 1) normalized = normalized.slice(0, -1)
  return normalized
}

// Helper: Find file in sessionFiles with fuzzy path matching
function findFileInSession(sessionFiles: Map<string, any>, inputPath: string): { file: any, resolvedPath: string } | null {
  // 1. Exact match
  const exactMatch = sessionFiles.get(inputPath)
  if (exactMatch) return { file: exactMatch, resolvedPath: inputPath }

  // 2. Normalized path
  const normalized = normalizeFilePath(inputPath)
  const normalizedMatch = sessionFiles.get(normalized)
  if (normalizedMatch) return { file: normalizedMatch, resolvedPath: normalized }

  // 3. Compare normalized stored paths
  for (const [storedPath, fileData] of sessionFiles.entries()) {
    if (normalizeFilePath(storedPath) === normalized) {
      return { file: fileData, resolvedPath: storedPath }
    }
  }

  // 4. Basename match (only if unique)
  const basename = inputPath.split('/').pop() || inputPath
  const basenameMatches: { path: string, file: any }[] = []
  for (const [storedPath, fileData] of sessionFiles.entries()) {
    const storedBasename = storedPath.split('/').pop() || storedPath
    if (storedBasename === basename && !fileData.isDirectory) {
      basenameMatches.push({ path: storedPath, file: fileData })
    }
  }
  if (basenameMatches.length === 1) {
    return { file: basenameMatches[0].file, resolvedPath: basenameMatches[0].path }
  }

  // 5. endsWith match
  const endsWithMatches: { path: string, file: any }[] = []
  for (const [storedPath, fileData] of sessionFiles.entries()) {
    if ((storedPath.endsWith('/' + normalized) || storedPath === normalized) && !fileData.isDirectory) {
      endsWithMatches.push({ path: storedPath, file: fileData })
    }
  }
  if (endsWithMatches.length === 1) {
    return { file: endsWithMatches[0].file, resolvedPath: endsWithMatches[0].path }
  }

  return null
}

// Helper: Get similar file paths for suggestions
function getSimilarPaths(sessionFiles: Map<string, any>, inputPath: string): string[] {
  const normalized = normalizeFilePath(inputPath)
  const basename = inputPath.split('/').pop() || inputPath
  const suggestions: string[] = []
  for (const [storedPath] of sessionFiles.entries()) {
    const storedBasename = storedPath.split('/').pop() || storedPath
    if (storedBasename === basename || storedPath.includes(normalized) || normalized.includes(storedBasename)) {
      suggestions.push(storedPath)
    }
  }
  return suggestions.slice(0, 3)
}

// Helper: Parse search/replace block (robust line-by-line parser matching main chat-v2 route)
function parseSearchReplaceBlock(blockText: string) {
  const SEARCH_START = "<<<<<<< SEARCH"
  const DIVIDER = "======="
  const REPLACE_END = ">>>>>>> REPLACE"
  const lines = blockText.split('\n')
  const searchLines: string[] = []
  const replaceLines: string[] = []
  let mode: 'none' | 'search' | 'replace' = 'none'

  for (const line of lines) {
    if (line.trim() === SEARCH_START) {
      mode = 'search'
    } else if (line.trim() === DIVIDER && mode === 'search') {
      mode = 'replace'
    } else if (line.trim() === REPLACE_END && mode === 'replace') {
      break
    } else if (mode === 'search') {
      searchLines.push(line)
    } else if (mode === 'replace') {
      replaceLines.push(line)
    }
  }

  const hasSearchContent = searchLines.some(line => line.trim() !== '')
  const hasReplaceContent = replaceLines.some(line => line.trim() !== '')
  if (!hasSearchContent && !hasReplaceContent) return null

  return {
    search: searchLines.join('\n'),
    replace: replaceLines.join('\n'),
  }
}

// Helper: Whitespace-flexible match when exact match fails
function tryWhitespaceFlexibleMatch(content: string, searchText: string): { index: number, matchedText: string } | null {
  const searchLines = searchText.split('\n')
  const contentLines = content.split('\n')

  for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
    let matches = true
    for (let j = 0; j < searchLines.length; j++) {
      if (searchLines[j].trim() !== contentLines[i + j].trim()) {
        matches = false
        break
      }
    }
    if (matches) {
      const matchedLines = contentLines.slice(i, i + searchLines.length)
      const matchedText = matchedLines.join('\n')
      const index = content.indexOf(matchedText)
      return { index: index >= 0 ? index : 0, matchedText }
    }
  }
  return null
}

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
      const found = findFileInSession(sessionFiles, path)
      if (found) {
        found.file.content = String(content)
        found.file.size = content.length
        return { success: true, message: `File ${found.resolvedPath} updated successfully.`, path: found.resolvedPath, content, action: 'updated' }
      }
      const normalizedPath = normalizeFilePath(path)
      sessionFiles.set(normalizedPath, {
        workspaceId: projectId,
        name: normalizedPath.split('/').pop() || normalizedPath,
        path: normalizedPath,
        content: String(content),
        fileType: normalizedPath.split('.').pop() || 'text',
        type: normalizedPath.split('.').pop() || 'text',
        size: content.length,
        isDirectory: false,
      })
      return { success: true, message: `File ${normalizedPath} created successfully.`, path: normalizedPath, content, action: 'created' }
    }

    case 'read_file': {
      const { path, startLine, endLine, lineRange } = input
      const found = findFileInSession(sessionFiles, path)
      if (!found) {
        const suggestions = getSimilarPaths(sessionFiles, path)
        return { success: false, error: `File not found: ${path}.${suggestions.length ? ` Did you mean: ${suggestions.join(', ')}?` : ' Use list_files to see available files.'}` }
      }

      const file = found.file
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
        return { success: true, path: found.resolvedPath, content, totalLines, truncated: true, message: `Showing first 200 of ${totalLines} lines. Use lineRange for specific sections.` }
      }

      return { success: true, path: found.resolvedPath, content, totalLines }
    }

    case 'edit_file': {
      const { filePath, searchReplaceBlock, replaceAll = false } = input
      const found = findFileInSession(sessionFiles, filePath)
      if (!found) {
        const suggestions = getSimilarPaths(sessionFiles, filePath)
        return { success: false, error: `File not found: ${filePath}.${suggestions.length ? ` Did you mean: ${suggestions.join(', ')}?` : ' Use list_files to see available files.'}` }
      }

      const file = found.file
      const resolvedPath = found.resolvedPath

      // Use robust line-by-line parser instead of brittle regex
      const parsedBlock = parseSearchReplaceBlock(searchReplaceBlock)
      if (!parsedBlock) {
        return { success: false, error: 'Invalid search/replace block format. Use: <<<<<<< SEARCH\\n[find]\\n=======\\n[replace]\\n>>>>>>> REPLACE' }
      }

      const { search: searchStr, replace: replaceStr } = parsedBlock
      const content = file.content || ''

      // Try exact match first
      if (content.includes(searchStr)) {
        const newContent = replaceAll
          ? content.split(searchStr).join(replaceStr)
          : content.replace(searchStr, replaceStr)
        file.content = newContent
        file.size = newContent.length
        return { success: true, message: `File ${resolvedPath} edited successfully.`, filePath: resolvedPath, action: 'edited' }
      }

      // Fallback: whitespace-flexible matching
      const flexMatch = tryWhitespaceFlexibleMatch(content, searchStr)
      if (flexMatch) {
        const newContent = content.replace(flexMatch.matchedText, replaceStr)
        file.content = newContent
        file.size = newContent.length
        console.log(`[Activity Chat V2] edit_file: Used whitespace-flexible matching for ${resolvedPath}`)
        return { success: true, message: `File ${resolvedPath} edited successfully (whitespace-flexible match).`, filePath: resolvedPath, action: 'edited' }
      }

      return { success: false, error: `Search string not found in ${resolvedPath} (tried exact and whitespace-flexible matching).`, searchStr: searchStr.substring(0, 100) }
    }

    case 'client_replace_string_in_file': {
      const { filePath, oldString, newString, replaceAll = false, caseInsensitive = false } = input
      const found = findFileInSession(sessionFiles, filePath)
      if (!found) {
        const suggestions = getSimilarPaths(sessionFiles, filePath)
        return { success: false, error: `File not found: ${filePath}.${suggestions.length ? ` Did you mean: ${suggestions.join(', ')}?` : ' Use list_files to see available files.'}` }
      }

      const file = found.file
      const resolvedPath = found.resolvedPath
      const content = file.content || ''

      const searchText = caseInsensitive ? oldString.toLowerCase() : oldString
      const contentToSearch = caseInsensitive ? content.toLowerCase() : content

      if (!contentToSearch.includes(searchText)) {
        return { success: false, error: `String not found in ${resolvedPath}`, oldString: oldString.substring(0, 100) }
      }

      let newContent: string
      if (replaceAll) {
        if (caseInsensitive) {
          let result = ''
          let lastIndex = 0
          let searchIndex = 0
          while ((searchIndex = contentToSearch.indexOf(searchText, lastIndex)) !== -1) {
            result += content.substring(lastIndex, searchIndex) + newString
            lastIndex = searchIndex + oldString.length
          }
          result += content.substring(lastIndex)
          newContent = result
        } else {
          newContent = content.split(oldString).join(newString)
        }
      } else {
        if (caseInsensitive) {
          const idx = contentToSearch.indexOf(searchText)
          newContent = content.substring(0, idx) + newString + content.substring(idx + oldString.length)
        } else {
          newContent = content.replace(oldString, newString)
        }
      }

      file.content = newContent
      file.size = newContent.length
      return { success: true, message: `File ${resolvedPath} modified successfully.`, filePath: resolvedPath, action: 'modified' }
    }

    case 'delete_file': {
      const { path } = input
      const found = findFileInSession(sessionFiles, path)
      if (!found) {
        const suggestions = getSimilarPaths(sessionFiles, path)
        return { success: false, error: `File not found: ${path}.${suggestions.length ? ` Did you mean: ${suggestions.join(', ')}?` : ''}` }
      }
      sessionFiles.delete(found.resolvedPath)
      return { success: true, message: `File ${found.resolvedPath} deleted.`, path: found.resolvedPath }
    }

    case 'delete_folder': {
      const { path } = input
      const normalizedPath = (path.endsWith('/') ? path : path + '/')
      const filesToDelete: string[] = []
      for (const filePath of sessionFiles.keys()) {
        if (filePath.startsWith(normalizedPath)) {
          filesToDelete.push(filePath)
        }
      }
      if (filesToDelete.length === 0) {
        return { success: false, error: `Folder not found or empty: ${path}` }
      }
      for (const fp of filesToDelete) {
        sessionFiles.delete(fp)
      }
      return { success: true, message: `Folder ${path} deleted (${filesToDelete.length} files removed).`, path, filesDeleted: filesToDelete.length }
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

/**
 * Sanitize messages before sending to the API.
 * Fixes the "Assistant message must have either content or tool_calls" error
 * by filtering out assistant messages with empty content.
 */
function sanitizeMessages(messages: any[]): any[] {
  return messages.filter((msg) => {
    // Always keep user and system messages
    if (msg.role !== 'assistant') return true
    // Keep assistant messages that have non-empty content
    if (typeof msg.content === 'string' && msg.content.trim().length > 0) return true
    // Keep assistant messages with array content that has items
    if (Array.isArray(msg.content) && msg.content.length > 0) return true
    // Drop assistant messages with empty/null/undefined content
    return false
  })
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
      openFiles = [],
      currentFile = null,
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

    // Build editor state context (currently open files)
    let editorStateStr = ''
    if (currentFile || (openFiles && openFiles.length > 0)) {
      editorStateStr = '\n\n# Editor State'
      if (currentFile) {
        editorStateStr += `\nCurrently focused file: \`${currentFile}\``
      }
      if (openFiles && openFiles.length > 0) {
        editorStateStr += `\nOpen files in editor tabs: ${openFiles.map((f: string) => `\`${f}\``).join(', ')}`
      }
    }

    const systemPrompt = `You are PiPilot Code Assistant - an AI coding assistant embedded in the code editor sidebar. You help users understand, write, and modify code in their projects.

${projectContext}${fileContextStr}${codebaseStr}${editorStateStr}

## Your Capabilities
- Read, write, edit, and delete project files using tools
- Search across the codebase with grep
- List files and directories
- Explain code, find bugs, suggest improvements
- Generate new code and modify existing code
- You know which files the user currently has open in their editor

## Guidelines
- Be concise and direct in your responses
- When modifying files, use the appropriate file tools
- Always read a file before editing it
- Provide code in markdown code blocks with language tags
- Focus on the user's specific question or task
- When creating or editing files, the changes are applied to the project in real-time
- If the user asks about "the current file" or "this file", refer to the currently focused file from the Editor State section
- IMPORTANT: Always provide a text response along with any tool calls. Never respond with only tool calls and no text.`

    // Build tools
    const tools: Record<string, any> = projectId ? {
      write_file: tool({
        description: 'Create or update a file in the project.',
        parameters: z.object({
          path: z.string().describe('File path relative to project root'),
          content: z.string().describe('Complete file content'),
        }),
        execute: async ({ path, content }) => {
          return constructToolResult('write_file', { path, content }, projectId)
        },
      }),

      read_file: tool({
        description: 'Read file contents. Use lineRange for large files.',
        parameters: z.object({
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
        description: 'Edit a file using search/replace blocks. IMPORTANT: If this tool fails more than 2 times on the same file, switch to using client_replace_string_in_file or write_file instead.',
        parameters: z.object({
          filePath: z.string().describe('File path relative to project root'),
          searchReplaceBlock: z.string().describe('Search/replace in format: <<<<<<< SEARCH\\n[find]\\n=======\\n[replace]\\n>>>>>>> REPLACE'),
          replaceAll: z.boolean().optional().describe('Replace all occurrences'),
        }),
        execute: async ({ filePath, searchReplaceBlock, replaceAll }) => {
          return constructToolResult('edit_file', { filePath, searchReplaceBlock, replaceAll }, projectId)
        },
      }),

      client_replace_string_in_file: tool({
        description: 'Replace exact strings in a file. More reliable than edit_file for simple replacements. Use this when edit_file fails.',
        parameters: z.object({
          filePath: z.string().describe('File path relative to project root'),
          oldString: z.string().describe('Exact string to find (must match exactly including whitespace)'),
          newString: z.string().describe('String to replace with'),
          replaceAll: z.boolean().optional().describe('Replace all occurrences (default: false)'),
          caseInsensitive: z.boolean().optional().describe('Case-insensitive matching (default: false)'),
        }),
        execute: async ({ filePath, oldString, newString, replaceAll, caseInsensitive }) => {
          return constructToolResult('client_replace_string_in_file', { filePath, oldString, newString, replaceAll, caseInsensitive }, projectId)
        },
      }),

      delete_file: tool({
        description: 'Delete a file from the project.',
        parameters: z.object({
          path: z.string().describe('File path to delete'),
        }),
        execute: async ({ path }) => {
          return constructToolResult('delete_file', { path }, projectId)
        },
      }),

      delete_folder: tool({
        description: 'Delete a folder and all its contents from the project.',
        parameters: z.object({
          path: z.string().describe('Folder path to delete'),
        }),
        execute: async ({ path }) => {
          return constructToolResult('delete_folder', { path }, projectId)
        },
      }),

      list_files: tool({
        description: 'List files in a directory.',
        parameters: z.object({
          path: z.string().optional().describe('Directory path (empty for root)'),
        }),
        execute: async ({ path }) => {
          return constructToolResult('list_files', { path }, projectId)
        },
      }),

      grep_search: tool({
        description: 'Search for patterns across project files.',
        parameters: z.object({
          pattern: z.string().describe('Search pattern (regex supported)'),
          path: z.string().optional().describe('Directory to search in'),
          caseSensitive: z.boolean().optional().describe('Case-sensitive search'),
        }),
        execute: async ({ pattern, path, caseSensitive }) => {
          return constructToolResult('grep_search', { pattern, path, caseSensitive }, projectId)
        },
      }),
    } : {}

    // Process and sanitize messages - keep last 10, filter empty assistant messages
    const processedMessages = messages.slice(-10)
    const sanitizedMessages = sanitizeMessages(processedMessages)

    // Ensure we have at least one user message
    if (sanitizedMessages.length === 0 || sanitizedMessages[sanitizedMessages.length - 1]?.role !== 'user') {
      return NextResponse.json({ error: 'Last message must be a user message' }, { status: 400 })
    }

    const result = await streamText({
      model,
      system: systemPrompt,
      temperature: 0.5,
      messages: sanitizedMessages,
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      ...(Object.keys(tools).length > 0 ? { stopWhen: stepCountIs(30) } : {}),
    })

    // Stream using newline-delimited JSON
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
            console.error('[Activity Chat V2] Stream error:', error)
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
    console.error('[Activity Chat V2] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
