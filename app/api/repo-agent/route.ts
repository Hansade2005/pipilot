import { streamText, tool, stepCountIs } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getModel } from '@/lib/ai-providers'
import { DEFAULT_CHAT_MODEL, getModelById } from '@/lib/ai-models'
import { NextResponse } from 'next/server'
import { authenticateUser, processRequestBilling } from '@/lib/billing/auth-middleware'
// Average credits per message estimate (for log display only - billing is token-based)
const CREDITS_PER_MESSAGE = 20
import { Octokit } from '@octokit/rest'
import { getOptimizedFileContext, getStagedChanges, getFileContent, applyIncrementalEdits } from './helpers'
import JSZip from 'jszip'

// Tavily API configuration for web search
const tavilyConfig = {
  apiKeys: (process.env.TAVILY_API_KEYS || '').split(',').filter(Boolean),
  searchUrl: 'https://api.tavily.com/search',
  extractUrl: 'https://api.tavily.com/extract',
  currentKeyIndex: 0
};

// Timeout utility function
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // For fetch requests, we need to handle AbortController differently
    if (promise instanceof Promise && 'abort' in (promise as any)) {
      // This is likely a fetch request, pass the signal
      const result = await promise;
      clearTimeout(timeoutId);
      return result;
    } else {
      const result = await promise;
      clearTimeout(timeoutId);
      return result;
    }
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`${operationName} timed out after ${timeoutMs}ms`);
    }
    throw error;
  }
}

// Clean and format web search results for better AI consumption
function cleanWebSearchResults(results: any[], query: string): string {
  if (!results || results.length === 0) {
    return `No results found for query: "${query}"`
  }

  let cleanedText = `🔍 **Web Search Results for: "${query}"**\n\n`

  results.forEach((result, index) => {
    const title = result.title || 'Untitled'
    const url = result.url || 'No URL'
    const content = result.content || result.raw_content || 'No content available'

    // Clean and truncate content to 1500 chars total
    const maxContentPerResult = Math.floor(1500 / results.length)
    const cleanedContent = content
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/\n+/g, ' ') // Replace multiple newlines with single space
      .trim()
      .substring(0, maxContentPerResult)

    cleanedText += `**${index + 1}. ${title}**\n`
    cleanedText += `🔗 ${url}\n`
    cleanedText += `${cleanedContent}${cleanedContent.length >= maxContentPerResult ? '...' : ''}\n\n`
  })

  // Ensure total length doesn't exceed 1500 characters
  if (cleanedText.length > 1500) {
    cleanedText = cleanedText.substring(0, 1497) + '...'
  }

  return cleanedText
}

// Web search function using Tavily API
async function searchWeb(query: string) {
  // Check if API keys are available
  if (tavilyConfig.apiKeys.length === 0) {
    throw new Error('No Tavily API keys are configured.');
  }

  try {
    console.log('Starting web search for:', query);

    // Rotate through available API keys
    const apiKey = tavilyConfig.apiKeys[tavilyConfig.currentKeyIndex];
    tavilyConfig.currentKeyIndex = (tavilyConfig.currentKeyIndex + 1) % tavilyConfig.apiKeys.length;

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        query: query,
        search_depth: "basic",
        include_answer: false,
        include_raw_content: true,
        max_results: 5
      })
    });

    if (!response.ok) {
      throw new Error(`Web search failed with status ${response.status}`);
    }

    const data = await response.json();

    // Clean and format results for AI consumption
    const cleanedResults = cleanWebSearchResults(data.results || [], query)

    console.log('Web search successful (cleaned and formatted):', {
      query,
      resultCount: data.results?.length || 0,
      cleanedLength: cleanedResults.length
    })

    return {
      rawData: data,
      cleanedResults: cleanedResults,
      query: query,
      resultCount: data.results?.length || 0
    }
  } catch (error) {
    console.error('Web search error:', error);
    throw error;
  }
}

// Disable Next.js body parser for binary data handling
export const config = {
  api: {
    bodyParser: false,
  },
}

// In-memory project storage for repo-agent sessions
// Key: repoKey (owner/repo), Value: { fileTree: string[], files: Map<path, fileData> }
const repoSessionStorage = new Map<string, {
  fileTree: string[]
  files: Map<string, any>
}>()

// Get AI model by ID with fallback to default
const getAIModel = (modelId?: string) => {
  try {
    const selectedModelId = modelId || DEFAULT_CHAT_MODEL
    const modelInfo = getModelById(selectedModelId)

    if (!modelInfo) {
      console.warn(`Model ${selectedModelId} not found, using default: ${DEFAULT_CHAT_MODEL}`)
      return getModel(DEFAULT_CHAT_MODEL)
    }

    console.log(`[RepoAgent] Using AI model: ${modelInfo.name} (${modelInfo.provider})`)
    return getModel(selectedModelId)
  } catch (error) {
    console.error('[RepoAgent] Failed to get AI model:', error)
    console.log(`[RepoAgent] Falling back to default model: ${DEFAULT_CHAT_MODEL}`)
    return getModel(DEFAULT_CHAT_MODEL)
  }
}

// Get specialized system prompt for Repo Agent
const getRepoAgentSystemPrompt = (modelId: string): string => {
  return `You are PiPilot SWE Agent, an elite AI assistant specialized in remote GitHub repository operations. You have direct access to manipulate files, create branches, and manage repositories through the GitHub API.

═══════════════════════════════════════════════════════════════
CORE CAPABILITIES
═══════════════════════════════════════════════════════════════

## 🔧 AVAILABLE TOOLS
- **github_read_file** - Read any file from the connected repository
- **github_write_file** - Create or update files in the repository
- **github_delete_file** - Remove files from the repository
- **github_list_files** - Browse repository directory structure
- **github_list_repos** - Show user's accessible repositories
- **github_get_repo_info** - Get repository metadata and details
- **github_get_commit_statuses** - Get deployment/CI statuses for a commit
- **github_create_branch** - Create new branches for changes
- **github_create_repo** - Create new GitHub repositories
- **github_create_tag** - Create tags (releases)
- **github_list_tags** - List repository tags
- **github_delete_tag** - Delete tags
- **github_search_code** - Search for code patterns across the repository
- **github_get_commits** - View commit history and changes
- **github_get_commit** - Get detailed information about a specific commit (files changed, additions/deletions, diffs)
- **github_revert_to_commit** - Revert repository to a specific commit (force reset all changes after that commit)
- **github_create_pull_request** - Create PRs for your changes
- **github_semantic_search** - Advanced semantic code search and analysis
- **github_replace_string** - Powerful string replacement with regex support
- **github_grep_search** - Elite multi-strategy search engine
- **github_edit_file** - Precise file editing with Git diff-style search/replace blocks
- **github_create_todo** - Create todo items to track progress on tasks
- **github_update_todo** - Update existing todo items (status, title, description)
- **github_delete_todo** - Delete todo items
- **check_dev_errors** - Run error checks on the repository (JavaScript/TypeScript build or Python syntax)
- **github_list_workflows** - List all GitHub Actions workflows in the repository
- **github_trigger_workflow** - Manually trigger a workflow run with optional input parameters
- **github_list_workflow_runs** - List runs for a specific workflow with status filtering
- **github_get_workflow_run** - Get detailed information about a specific workflow run (status, timing, logs URL)
- **github_get_workflow_run_logs** - Download and retrieve complete logs from a workflow run
- **github_cancel_workflow_run** - Cancel an in-progress workflow run
- **github_rerun_workflow** - Rerun a failed or previous workflow execution
- **web_search** - Search the web for current information and context, returns clean structured text
- **web_extract** - Extract content from web pages using AnyAPI web scraper

## 🎯 WORKFLOW PRINCIPLES
1. **Repository Context**: Always maintain awareness of the current repository and branch
2. **Safe Operations**: Never delete important files without confirmation
3. **Clear Communication**: Explain every action you're taking
4. **MANDATORY BRANCH WORKFLOW**: NEVER make changes directly to the main branch
   - Always create a new branch first before commencing any edit or modification session
   - Perform all changes on the new branch
   - When done, create a pull request so the user can review and merge manually to main
5. **Code Quality**: Follow repository conventions and patterns

## 🌐 WEB RESEARCH CAPABILITIES
- **web_search**: Use when you need current information, documentation, or context from the internet
  - Search for programming frameworks, APIs, best practices, or troubleshooting information
  - Get up-to-date information about tools, libraries, or technologies
  - Research solutions to technical problems or implementation approaches
- **web_extract**: Use when you need to analyze specific web pages or documentation
  - Extract content from API documentation, tutorials, or technical articles
  - Get detailed information from specific URLs for implementation reference
  - Combine with web_search to get comprehensive information about a topic

## 📋 EDITING TOOLS GUIDE
- **github_write_file**: For creating new files or completely replacing existing ones
- **github_edit_file**: For precise edits using Git diff-style search/replace blocks (recommended for most edits)
- **github_replace_string**: For simple string replacements with regex support
- **github_delete_file**: For removing files entirely

## 📋 TODO MANAGEMENT
- **github_create_todo**: Create todo items with unique IDs to track task progress
  - Always provide a descriptive, unique ID (e.g., "setup-database-schema", "implement-user-auth", "add-error-handling")
  - Use clear, actionable titles and detailed descriptions
  - Set appropriate initial status (usually "pending")
- **github_update_todo**: Modify existing todos by their exact ID
  - Update status to "completed" when tasks are finished
  - Modify titles/descriptions as needed for clarity
- **github_delete_todo**: Remove todos that are no longer relevant
- **ID Consistency**: Always use the exact same ID you created for updates/deletes
- **Context Awareness**: Check existing todos above before creating new ones - update existing todos instead of creating duplicates

## 📋 RESPONSE FORMAT
When performing operations:
1. **Acknowledge** the user's request
2. **Plan** your approach (which tools to use)
3. **Execute** operations step by step
4. **Report** results clearly
5. **Suggest** next steps if applicable

## 🚨 SAFETY PROTOCOLS
- Never modify .env files or sensitive configuration
- **CRITICAL**: Never make changes directly to the main branch - always create a new branch first
- Always create a pull request after completing changes on a feature branch
- Respect repository branch protection rules
- Ask for confirmation on destructive operations

═══════════════════════════════════════════════════════════════
SWE AGENT WORKFLOW
═══════════════════════════════════════════════════════════════

**MANDATORY BRANCH WORKFLOW:**
1. **NEVER work on main branch directly** - This is a hard rule
2. **Always create a new branch** before starting any modifications
3. **Perform all changes on the new branch** you created
4. **Create a pull request** when changes are complete for user review
5. **Let the user merge** the PR manually to main branch

**Initial Setup:**
- Confirm repository connection
- Verify user permissions
- Create a new branch immediately if any changes will be made

**Task Execution:**
- Break down complex tasks into steps
- Use appropriate tools for each operation
- Provide progress updates
- Handle errors gracefully

**Completion:**
- Summarize changes made
- Always create a pull request for the changes
- Suggest follow-up actions if applicable

Remember: You are working directly on live GitHub repositories. Every action you take is real and permanent. **CRITICAL RULE: Never make changes directly to the main branch. Always create a new branch first, make your changes there, then create a pull request for user review.** Exercise caution and clarity in all operations.`
}

// GitHub API utility functions
const createOctokitClient = (token: string) => {
  return new Octokit({
    auth: token,
  })
}

const getUserEmail = async (octokit: Octokit) => {
  try {
    const emails = await octokit.users.listEmailsForAuthenticatedUser()
    const primaryEmail = emails.data.find(email => email.primary && email.verified)
    return primaryEmail ? primaryEmail.email : null
  } catch (error) {
    console.error('Failed to get user email:', error)
    return null
  }
}

const parseRepoString = (repoString: string) => {
  const [owner, repo] = repoString.split('/')
  return { owner, repo }
}

// Advanced tool helper functions
const buildSemanticSearchTerms = (query: string): string => {
  const lowerQuery = query.toLowerCase()

  // Map natural language to code patterns
  const semanticMappings: Record<string, string[]> = {
    'react component': ['function.*Component', 'const.*=.*\\(', 'export.*function', 'export.*const'],
    'api endpoint': ['router\\.', 'app\\.', 'Route', '@app\\.route', 'def.*api', 'func.*handler'],
    'error handling': ['try.*catch', 'except', 'rescue', 'catch.*Error', 'throw', 'raise'],
    'database model': ['class.*Model', 'interface.*Model', 'type.*Model', 'Schema', 'model\\('],
    'test file': ['describe\\(', 'it\\(', 'test\\(', 'spec', '\\.test\\.', '\\.spec\\.'],
    'configuration': ['config', 'settings', 'env', 'Config', 'Settings'],
    'utility function': ['export.*function', 'export.*const', 'util', 'helper', 'Utils'],
    'hook': ['use[A-Z]', 'useState', 'useEffect', 'useCallback', 'useMemo'],
    'middleware': ['middleware', 'Middleware', 'next\\(', 'req.*res'],
    'validation': ['validate', 'schema', 'zod', 'yup', 'joi', 'Validate']
  }

  const terms = []
  for (const [key, patterns] of Object.entries(semanticMappings)) {
    if (lowerQuery.includes(key)) {
      terms.push(...patterns)
    }
  }

  // Add the original query if no semantic matches
  if (terms.length === 0) {
    terms.push(query)
  }

  return terms.join(' OR ')
}

const detectLanguage = (filePath: string, content: string): string => {
  const ext = filePath.split('.').pop()?.toLowerCase()

  const languageMap: Record<string, string> = {
    'js': 'JavaScript',
    'jsx': 'JavaScript React',
    'ts': 'TypeScript',
    'tsx': 'TypeScript React',
    'py': 'Python',
    'java': 'Java',
    'cpp': 'C++',
    'c': 'C',
    'cs': 'C#',
    'php': 'PHP',
    'rb': 'Ruby',
    'go': 'Go',
    'rs': 'Rust',
    'swift': 'Swift',
    'kt': 'Kotlin',
    'scala': 'Scala',
    'html': 'HTML',
    'css': 'CSS',
    'scss': 'SCSS',
    'sass': 'Sass',
    'less': 'Less',
    'json': 'JSON',
    'xml': 'XML',
    'yaml': 'YAML',
    'yml': 'YAML',
    'md': 'Markdown',
    'sh': 'Shell',
    'bash': 'Bash',
    'sql': 'SQL'
  }

  return languageMap[ext || ''] || 'Unknown'
}

const getRelevantExcerpt = (content: string, query: string, lines: number): string => {
  const contentLines = content.split('\n')
  const lowerQuery = query.toLowerCase()

  // Find lines containing the query
  const matchingLines = contentLines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.toLowerCase().includes(lowerQuery))
    .slice(0, lines)

  if (matchingLines.length === 0) {
    // Return first few lines if no matches
    return contentLines.slice(0, lines).join('\n')
  }

  // Get context around first match
  const matchIndex = matchingLines[0].index
  const start = Math.max(0, matchIndex - Math.floor(lines / 2))
  const end = Math.min(contentLines.length, start + lines)

  return contentLines.slice(start, end).join('\n')
}

const findSemanticMatches = (content: string, query: string): any[] => {
  const lines = content.split('\n')
  const matches = []
  const lowerQuery = query.toLowerCase()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.toLowerCase().includes(lowerQuery)) {
      matches.push({
        lineNumber: i + 1,
        content: line.trim(),
        type: 'text_match'
      })
    }
  }

  return matches
}

const escapeRegExp = (string: string): string => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Function to import GitHub repository and store in session memory
const importGithubRepoForSession = async (repoUrl: string, repoKey: string, octokit: any, ref: string = 'HEAD') => {
  console.log(`[RepoAgent] 🚀 Importing GitHub repository for session: ${repoUrl}`)

  try {
    // Parse repo URL to get owner and repo
    const repoUrlMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/)
    if (!repoUrlMatch) {
      throw new Error('Invalid GitHub repository URL')
    }
    const [, owner, repo] = repoUrlMatch
    const repoName = `${owner}-${repo}`

    // Download repository archive directly using Octokit (works for private repos)
    console.log(`[RepoAgent] 📦 Downloading repository archive for ${owner}/${repo} at ref ${ref}`)
    const archiveResponse = await octokit.rest.repos.downloadZipballArchive({
      owner,
      repo,
      ref: ref // Use specified ref
    })

    // Handle the binary data correctly - Octokit returns data as Buffer/ArrayBuffer
    // Convert to ArrayBuffer if it's not already, then create proper Blob
    let arrayBuffer: ArrayBuffer

    if (archiveResponse.data instanceof ArrayBuffer) {
      arrayBuffer = archiveResponse.data
    } else if (Buffer.isBuffer(archiveResponse.data)) {
      arrayBuffer = archiveResponse.data.buffer.slice(
        archiveResponse.data.byteOffset,
        archiveResponse.data.byteOffset + archiveResponse.data.byteLength
      )
    } else if (archiveResponse.data instanceof Uint8Array) {
      arrayBuffer = archiveResponse.data.buffer
    } else {
      // Fallback: try to convert from base64 if it's a string
      const dataStr = archiveResponse.data.toString()
      if (typeof dataStr === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(dataStr)) {
        arrayBuffer = Uint8Array.from(atob(dataStr), c => c.charCodeAt(0)).buffer
      } else {
        throw new Error('Unable to convert archive data to ArrayBuffer')
      }
    }

    // Create blob from ArrayBuffer (same as chat-input pattern)
    const zipBlob = new Blob([arrayBuffer], {
      type: 'application/zip'
    })

    const zip = await JSZip.loadAsync(zipBlob)
    const filesToCreate: Array<{ path: string; content: string }> = []

    // Process each file in the zip
    for (const [path, zipEntry] of Object.entries(zip.files)) {
      const entry = zipEntry as any
      if (entry.dir) continue // Skip directories

      // Remove the repo name prefix from path (e.g., "repo-name-main/" -> "")
      const cleanPath = path.replace(`${repoName}-main/`, '').replace(`${repoName}-master/`, '')

      if (!cleanPath || cleanPath.startsWith('.') || cleanPath.includes('/.git/')) continue

      try {
        const content = await entry.async('text')
        filesToCreate.push({
          path: cleanPath,
          content: content
        })
      } catch (error) {
        console.warn(`⚠️ Could not extract text content for ${cleanPath}:`, error)
      }
    }

    // Filter out unwanted files (similar to chat-input.tsx)
    const filterUnwantedFiles = (files: Array<{ path: string; content: string }>) => {
      return files.filter(file => {
        const path = file.path.toLowerCase()
        // Skip images, videos, PDFs, and other binary files
        if (path.endsWith('.jpg') || path.endsWith('.jpeg') || path.endsWith('.png') ||
            path.endsWith('.gif') || path.endsWith('.bmp') || path.endsWith('.webp') ||
            path.endsWith('.svg') || path.endsWith('.ico') || path.endsWith('.mp4') ||
            path.endsWith('.avi') || path.endsWith('.mov') || path.endsWith('.wmv') ||
            path.endsWith('.pdf') || path.endsWith('.zip') || path.endsWith('.tar') ||
            path.endsWith('.gz') || path.endsWith('.rar') || path.endsWith('.7z')) {
          return false
        }
        // Skip certain folders
        if (path.includes('/.git/') || path.includes('/node_modules/') ||
            path.includes('/.next/') || path.includes('/dist/') ||
            path.includes('/build/') || path.includes('/scripts/') ||
            path.includes('/test') || path.includes('/tests/') ||
            path.includes('/__tests__/') || path.includes('/coverage/')) {
          return false
        }
        return true
      })
    }

    const filteredFiles = filterUnwantedFiles(filesToCreate)
    console.log(`[RepoAgent] 📦 Extracted ${filteredFiles.length} files from ${repoName}`)

    // Convert to session storage format (like chat-v2)
    const sessionFiles = new Map<string, any>()
    const fileTree: string[] = []

    for (const file of filteredFiles) {
      const fileData = {
        path: file.path,
        content: file.content,
        name: file.path.split('/').pop() || file.path,
        fileType: file.path.split('.').pop() || 'text',
        type: file.path.split('.').pop() || 'text',
        size: file.content.length,
        isDirectory: false,
        folderId: undefined,
        metadata: {}
      }
      sessionFiles.set(file.path, fileData)
      fileTree.push(file.path)
    }

    // Store in session memory
    repoSessionStorage.set(repoKey, {
      fileTree,
      files: sessionFiles
    })

    console.log(`[RepoAgent] ✅ Stored ${sessionFiles.size} files in session memory for ${repoKey}`)
    return { success: true, fileCount: sessionFiles.size }

  } catch (error) {
    console.error('[RepoAgent] ❌ Failed to import GitHub repository:', error)
    throw error
  }
}

export async function POST(req: Request) {
  let requestId = crypto.randomUUID()
  let startTime = Date.now()
  let authContext: any = null

  // Declare variables at function scope for error handling access
  let modelId: string | undefined
  let messages: any[] | undefined
  let currentRepo: string | undefined
  let currentBranch: string = 'main'
  let githubToken: string | undefined

  console.log(`[RepoAgent:${requestId.slice(0, 8)}] 🚀 Incoming POST request at ${new Date().toISOString()}`)

  try {
    // ============================================================================
    // BASIC AUTH CHECK - Supabase Authentication
    // ============================================================================
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ============================================================================
    // ABE CREDIT SYSTEM - Authenticate and check credits
    // ============================================================================
    const authResult = await authenticateUser(req)

    if (!authResult.success || !authResult.context) {
      console.error(`[RepoAgent] ❌ Authentication failed:`, authResult.error)
      return NextResponse.json(
        {
          error: {
            message: authResult.error?.message || 'Authentication failed',
            code: authResult.error?.code || 'UNAUTHORIZED',
            type: 'credit_error'
          }
        },
        { status: authResult.error?.statusCode || 401 }
      )
    }

    authContext = authResult.context
    console.log(
      `[RepoAgent] ✅ Authenticated: User ${authContext.userId}, Plan: ${authContext.currentPlan}, Balance: ${authContext.creditsBalance} credits (${Math.floor(authContext.creditsBalance / CREDITS_PER_MESSAGE)} messages remaining)`
    )

    // Parse request body
    const body = await req.json()
    console.log(`[RepoAgent:${requestId.slice(0, 8)}] 📝 Request body received:`, {
      messages: body.messages?.length || 0,
      repo: body.repo,
      branch: body.branch || 'main',
      modelId: body.modelId || DEFAULT_CHAT_MODEL,
      lastMessagePreview: body.messages?.[body.messages.length - 1]?.content?.substring(0, 100) || 'N/A'
    })
      ; ({
        messages,
        modelId,
        repo: currentRepo,
        branch: currentBranch = 'main',
        githubToken
      } = body)

    // Extract todos from request body
    let todos = body.todos || []

    if (!messages || !Array.isArray(messages)) {
      console.error(`[RepoAgent:${requestId.slice(0, 8)}] ❌ Invalid request: Messages array is required`)
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 })
    }

    if (!currentRepo) {
      console.error(`[RepoAgent:${requestId.slice(0, 8)}] ❌ Invalid request: Repository is required`)
      return NextResponse.json({ error: 'Repository is required' }, { status: 400 })
    }

    if (!githubToken) {
      console.error(`[RepoAgent:${requestId.slice(0, 8)}] ❌ Invalid request: GitHub token is required`)
      return NextResponse.json({ error: 'GitHub token is required' }, { status: 400 })
    }

    // Ensure todos is properly typed
    const activeTodos = Array.isArray(todos) ? todos : []
    console.log(`[RepoAgent:${requestId.slice(0, 8)}] 📋 Active todos: ${activeTodos.length}`)

    console.log(`[RepoAgent:${requestId.slice(0, 8)}] ✅ Request validation passed - Repo: ${currentRepo}, Branch: ${currentBranch}, Model: ${modelId}`)

    // Initialize Octokit client
    const octokit = createOctokitClient(githubToken)

    // Get authenticated user's email for commits
    const userEmail = await getUserEmail(octokit)

    // Verify repository access
    try {
      const { owner, repo } = parseRepoString(currentRepo)
      await octokit.rest.repos.get({ owner, repo })
    } catch (error) {
      console.error('[RepoAgent] Repository access verification failed:', error)
      return NextResponse.json({
        error: 'Cannot access the specified repository. Please check your permissions and repository name.'
      }, { status: 403 })
    }

    // Initialize request-scoped staging storage
    const requestStagedChanges = new Map<string, any>()

    // Get optimized context
    const { owner, repo } = parseRepoString(currentRepo)
    const repoContext = await getOptimizedFileContext(octokit, owner, repo, currentBranch)

    // Get AI model
    const model = getAIModel(modelId)
    const baseSystemPrompt = getRepoAgentSystemPrompt(modelId || DEFAULT_CHAT_MODEL)

    // Enhanced System Prompt
    const systemPrompt = `${baseSystemPrompt}

═══════════════════════════════════════════════════════════════
CONTEXT & STATE
═══════════════════════════════════════════════════════════════
Current Repository: ${currentRepo}
Current Branch: ${currentBranch}

${repoContext}

═══════════════════════════════════════════════════════════════
ACTIVE TODO ITEMS
═══════════════════════════════════════════════════════════════
${activeTodos.length > 0 ? activeTodos.map((todo: any) => 
  `• [${todo.status.toUpperCase()}] ${todo.id}: ${todo.title}${todo.description ? ` - ${todo.description}` : ''}`
).join('\n') : 'No active todos'}

═══════════════════════════════════════════════════════════════
STAGING & COMMIT WORKFLOW (MANDATORY)
═══════════════════════════════════════════════════════════════
You MUST use the Staging Workflow for ALL code changes:

1. **STAGE**: Use \`github_stage_change\` to record changes in memory.
   - You can stage multiple files in sequence or parallel.
   - NO changes are applied to GitHub yet.

2. **COMMIT**: Use \`github_commit_changes\` to apply ALL staged changes.
   - This performs the Git Tree operations (Blobs -> Tree -> Commit -> Ref).
   - Require a SINGLE clear commit message (Conventional Commits format preferred).

DO NOT use \`github_write_file\` or \`github_delete_file\` for code changes anymore. 
Use them ONLY if specifically asked for direct operations, but prefer Staging.

Example:
User: "Update auth.ts and user.ts"
Assistant:
- github_stage_change(auth.ts, ...)
- github_stage_change(user.ts, ...)
- github_commit_changes("feat: update auth and user models")
`

    // Define GitHub repository tools
    const tools = {
      // --- Staging & Commits ---
      github_stage_change: tool({
        description: 'Stage a file change (create, update, or delete) in memory. Supports both full rewrites and incremental edits. DOES NOT apply to GitHub immediately.',
        inputSchema: z.object({
          path: z.string().describe('File path'),
          content: z.string().optional().describe('New content (required for create/update in rewrite mode)'),
          operation: z.enum(['create', 'update', 'delete']).describe('Type of operation'),
          edit_mode: z.enum(['rewrite', 'incremental']).default('rewrite').describe('How to apply changes: rewrite (provide full content) or incremental (apply specific edits)'),
          edit_operations: z.array(z.object({
            old_string: z.string().describe('Text to replace (must be unique within context)'),
            new_string: z.string().describe('Replacement text'),
            context_lines: z.number().optional().default(3).describe('Lines of context before/after for uniqueness (3-5 recommended)')
          })).optional().describe('Incremental edits to apply (only used in incremental mode)'),
          description: z.string().optional().describe('Brief description of change')
        }),
        execute: async ({ path, content, operation, edit_mode = 'rewrite', edit_operations }) => {
          console.log(`[RepoAgent:${requestId.slice(0, 8)}] 📝 Staging change: ${operation} ${path} (${edit_mode} mode)`)

          let finalContent = content

          if (edit_mode === 'incremental' && edit_operations && operation !== 'delete') {
            try {
              // Read current file content for incremental editing
              const currentContent = await getFileContent(octokit, owner, repo, path, currentBranch)
              finalContent = applyIncrementalEdits(currentContent, edit_operations)
              console.log(`[RepoAgent] Applied ${edit_operations.length} incremental edits to ${path}`)
            } catch (error) {
              console.error(`[RepoAgent] Failed to apply incremental edits to ${path}:`, error)
              const errorMessage = error instanceof Error ? error.message : String(error)
              return { success: false, error: `Failed to apply incremental edits: ${errorMessage}` }
            }
          }

          requestStagedChanges.set(path, { operation, content: finalContent })
          return { success: true, status: 'staged', path, operation, edit_mode, edits_applied: edit_operations?.length || 0 }
        }
      }),

      github_commit_changes: tool({
        description: 'Commit all staged changes to the repository using Git Tree API.',
        inputSchema: z.object({
          message: z.string().describe('Commit message (Conventional Commits format)'),
          branch: z.string().optional().describe('Branch to commit to (defaults to current)')
        }),
        execute: async ({ message, branch: targetBranch }) => {
          const branch = targetBranch || currentBranch
          console.log(`[RepoAgent:${requestId.slice(0, 8)}] 💾 Committing staged changes to ${branch}`)

          try {
            // 1. Gather all staged changes (History + Current Request)
            const allChanges = getStagedChanges(messages || [], requestStagedChanges)

            if (allChanges.size === 0) {
              return { success: false, error: 'No staged changes found to commit.' }
            }

            console.log(`[RepoAgent] Found ${allChanges.size} files to commit`)

            // 2. Get latest commit SHA
            const ref = await octokit.rest.git.getRef({
              owner,
              repo,
              ref: `heads/${branch}`
            })
            const latestCommitSha = ref.data.object.sha
            const latestCommit = await octokit.rest.git.getCommit({
              owner,
              repo,
              commit_sha: latestCommitSha
            })
            const baseTreeSha = latestCommit.data.tree.sha

            // 3. Create Blobs for updated/created files
            const treeItems = []

            for (const [path, change] of allChanges.entries()) {
              if (change.operation === 'delete') {
                console.log(`[RepoAgent] Handling delete for ${path} via separate operation`)
                await octokit.rest.repos.deleteFile({
                  owner,
                  repo,
                  path,
                  message: `Delete ${path} (part of ${message})`,
                  sha: (await octokit.rest.repos.getContent({ owner, repo, path }) as any).data.sha,
                  branch,
                  author: {
                    name: process.env.PIPILOT_BOT_NAME || 'pipilot-swe-bot',
                    email: userEmail || 'noreply@github.com'
                  }
                })
              } else {
                const blob = await octokit.rest.git.createBlob({
                  owner,
                  repo,
                  content: change.content,
                  encoding: 'utf-8'
                })

                treeItems.push({
                  path,
                  mode: '100644' as const, // standard file
                  type: 'blob' as const,
                  sha: blob.data.sha
                })
              }
            }

            if (treeItems.length === 0) {
              return { success: true, message: "No content updates to commit (deletes may have occurred)" }
            }

            // 4. Create Tree
            const newTree = await octokit.rest.git.createTree({
              owner,
              repo,
              base_tree: baseTreeSha,
              tree: treeItems
            })

            // 5. Create Commit
            const newCommit = await octokit.rest.git.createCommit({
              owner,
              repo,
              message,
              tree: newTree.data.sha,
              parents: [latestCommitSha],
              author: {
                name: process.env.PIPILOT_BOT_NAME || 'pipilot-swe-bot',
                email: userEmail || 'noreply@github.com'
              }
            })

            // 6. Update Ref
            await octokit.rest.git.updateRef({
              owner,
              repo,
              ref: `heads/${branch}`,
              sha: newCommit.data.sha
            })

            // Clear staged changes (conceptually, for this turn)
            requestStagedChanges.clear()

            return {
              success: true,
              commit: {
                sha: newCommit.data.sha,
                message,
                url: newCommit.data.html_url
              }
            }
          } catch (error) {
            const errorMsg = `Failed to commit changes: ${error instanceof Error ? error.message : 'Unknown error'}`
            console.error('[RepoAgent] Commit failed:', errorMsg)
            return { success: false, error: errorMsg }
          }
        }
      }),

      github_delete_branch: tool({
        description: 'Delete a branch from the repository',
        inputSchema: z.object({
          repo: z.string().describe('Repository (owner/repo)'),
          branch: z.string().describe('Branch to delete')
        }),
        execute: async ({ repo, branch }) => {
          try {
            const { owner, repo: repoName } = parseRepoString(repo)
            await octokit.rest.git.deleteRef({
              owner,
              repo: repoName,
              ref: `heads/${branch}`
            })
            return { success: true, message: `Branch ${branch} deleted` }
          } catch (error) {
            return { success: false, error: `Failed to delete branch: ${error}` }
          }
        }
      }),

      // Repository Management
      github_list_repos: tool({
        description: 'List all repositories the user has access to',
        inputSchema: z.object({
          type: z.enum(['all', 'owner', 'public', 'private', 'member']).optional().describe('Filter repository type'),
          sort: z.enum(['created', 'updated', 'pushed', 'full_name']).optional().describe('Sort repositories by'),
          per_page: z.number().min(1).max(100).optional().describe('Number of results per page')
        }),
        execute: async ({ type = 'all', sort = 'updated', per_page = 30 }) => {
          console.log(`[RepoAgent:${requestId.slice(0, 8)}] 🔧 Tool call: github_list_repos - Input:`, { type, sort, per_page })
          try {
            const response = await octokit.rest.repos.listForAuthenticatedUser({
              type,
              sort,
              per_page
            })
            const result = {
              success: true,
              repositories: response.data.map(repo => ({
                name: repo.name,
                full_name: repo.full_name,
                description: repo.description,
                private: repo.private,
                html_url: repo.html_url,
                default_branch: repo.default_branch,
                updated_at: repo.updated_at
              }))
            }
            console.log(`[RepoAgent:${requestId.slice(0, 8)}] ✅ github_list_repos completed - Found ${result.repositories.length} repositories`)
            return result
          } catch (error) {
            const errorMsg = `Failed to list repositories: ${error instanceof Error ? error.message : 'Unknown error'}`
            console.error(`[RepoAgent:${requestId.slice(0, 8)}] ❌ github_list_repos failed:`, errorMsg)
            return {
              success: false,
              error: errorMsg
            }
          }
        }
      }),

      github_get_commit_statuses: tool({
        description: 'Get the deployment or CI statuses for a specific commit SHA or ref',
        inputSchema: z.object({
          repo: z.string().describe('Repository in format "owner/repo"'),
          ref: z.string().describe('Commit SHA, branch name, or tag name')
        }),
        execute: async ({ repo, ref }) => {
          console.log(`[RepoAgent:${requestId.slice(0, 8)}] 🔧 Tool call: github_get_commit_statuses - Input:`, { repo, ref })
          try {
            const { owner, repo: repoName } = parseRepoString(repo)
            const response = await octokit.rest.repos.listCommitStatusesForRef({
              owner,
              repo: repoName,
              ref
            })

            const result = {
              success: true,
              total_count: response.data.length,
              statuses: response.data.map(status => ({
                state: status.state, // 'error', 'failure', 'pending', 'success'
                description: status.description,
                context: status.context,
                target_url: status.target_url,
                created_at: status.created_at,
                updated_at: status.updated_at
              }))
            }
            console.log(`[RepoAgent:${requestId.slice(0, 8)}] ✅ github_get_commit_statuses completed - Found ${result.total_count} statuses`)
            return result
          } catch (error) {
            const errorMsg = `Failed to get commit statuses: ${error instanceof Error ? error.message : 'Unknown error'}`
            console.error(`[RepoAgent:${requestId.slice(0, 8)}] ❌ github_get_commit_statuses failed:`, errorMsg)
            return {
              success: false,
              error: errorMsg
            }
          }
        }
      }),

      github_get_repo_info: tool({
        description: 'Get detailed information about a specific repository',
        inputSchema: z.object({
          repo: z.string().describe('Repository in format "owner/repo"')
        }),
        execute: async ({ repo }) => {
          console.log(`[RepoAgent:${requestId.slice(0, 8)}] 🔧 Tool call: github_get_repo_info - Input:`, { repo })
          try {
            const { owner, repo: repoName } = parseRepoString(repo)
            const response = await octokit.rest.repos.get({ owner, repo: repoName })

            const result = {
              success: true,
              repository: {
                name: response.data.name,
                full_name: response.data.full_name,
                description: response.data.description,
                private: response.data.private,
                html_url: response.data.html_url,
                default_branch: response.data.default_branch,
                language: response.data.language,
                stars: response.data.stargazers_count,
                forks: response.data.forks_count,
                issues: response.data.open_issues_count,
                created_at: response.data.created_at,
                updated_at: response.data.updated_at
              }
            }
            console.log(`[RepoAgent:${requestId.slice(0, 8)}] ✅ github_get_repo_info completed - Repo: ${result.repository.full_name}`)
            return result
          } catch (error) {
            const errorMsg = `Failed to get repository info: ${error instanceof Error ? error.message : 'Unknown error'}`
            console.error(`[RepoAgent:${requestId.slice(0, 8)}] ❌ github_get_repo_info failed:`, errorMsg)
            return {
              success: false,
              error: errorMsg
            }
          }
        }
      }),

      github_create_repo: tool({
        description: 'Create a new GitHub repository for the authenticated user',
        inputSchema: z.object({
          name: z.string().describe('Repository name'),
          description: z.string().optional().describe('Repository description'),
          private: z.boolean().optional().describe('Whether the repository should be private'),
          auto_init: z.boolean().optional().describe('Initialize with README')
        }),
        execute: async ({ name, description, private: isPrivate, auto_init }) => {
          console.log(`[RepoAgent:${requestId.slice(0, 8)}] 🔧 Tool call: github_create_repo - Input:`, { name })
          try {
            const response = await octokit.rest.repos.createForAuthenticatedUser({
              name,
              description,
              private: isPrivate,
              auto_init
            })
            return {
              success: true,
              repository: {
                name: response.data.name,
                full_name: response.data.full_name,
                html_url: response.data.html_url
              }
            }
          } catch (error) {
            const errorMsg = `Failed to create repository: ${error instanceof Error ? error.message : 'Unknown error'}`
            return { success: false, error: errorMsg }
          }
        }
      }),

      github_create_tag: tool({
        description: 'Create a tag in the repository. Provide "message" for an annotated tag, or leave it empty for a lightweight tag.',
        inputSchema: z.object({
          repo: z.string().describe('Repository name (owner/repo)'),
          tag: z.string().describe('Tag name (e.g., v1.0.0)'),
          sha: z.string().describe('Commit SHA to tag'),
          message: z.string().optional().describe('Optional message for annotated tag')
        }),
        execute: async ({ repo, tag, sha, message }) => {
          console.log(`[RepoAgent:${requestId.slice(0, 8)}] 🔧 Tool call: github_create_tag - Input:`, { repo, tag, sha })
          try {
            const { owner, repo: repoName } = parseRepoString(repo)

            if (message) {
              // Annotated Tag
              const tagObject = await octokit.rest.git.createTag({
                owner,
                repo: repoName,
                tag,
                message,
                object: sha,
                type: 'commit'
              })
              await octokit.rest.git.createRef({
                owner,
                repo: repoName,
                ref: `refs/tags/${tag}`,
                sha: tagObject.data.sha
              })
            } else {
              // Lightweight Tag
              await octokit.rest.git.createRef({
                owner,
                repo: repoName,
                ref: `refs/tags/${tag}`,
                sha
              })
            }
            return { success: true, message: `Tag ${tag} created successfully` }
          } catch (error) {
            const errorMsg = `Failed to create tag: ${error instanceof Error ? error.message : 'Unknown error'}`
            return { success: false, error: errorMsg }
          }
        }
      }),

      github_list_tags: tool({
        description: 'List tags in a repository',
        inputSchema: z.object({
          repo: z.string().describe('Repository name (owner/repo)'),
          per_page: z.number().optional().describe('Items per page')
        }),
        execute: async ({ repo, per_page = 30 }) => {
          try {
            const { owner, repo: repoName } = parseRepoString(repo)
            const response = await octokit.rest.repos.listTags({
              owner,
              repo: repoName,
              per_page
            })
            return {
              success: true,
              tags: response.data.map(t => ({ name: t.name, commit: t.commit }))
            }
          } catch (error) {
            const errorMsg = `Failed to list tags: ${error instanceof Error ? error.message : 'Unknown error'}`
            return { success: false, error: errorMsg }
          }
        }
      }),

      github_delete_tag: tool({
        description: 'Delete a tag from the repository',
        inputSchema: z.object({
          repo: z.string().describe('Repository name (owner/repo)'),
          tag: z.string().describe('Tag name to delete')
        }),
        execute: async ({ repo, tag }) => {
          try {
            const { owner, repo: repoName } = parseRepoString(repo)
            await octokit.rest.git.deleteRef({
              owner,
              repo: repoName,
              ref: `tags/${tag}`
            })
            return { success: true, message: `Tag ${tag} deleted` }
          } catch (error) {
            const errorMsg = `Failed to delete tag: ${error instanceof Error ? error.message : 'Unknown error'}`
            return { success: false, error: errorMsg }
          }
        }
      }),

      // File Operations
      github_read_file: tool({
        description: 'Read the contents of a file from the repository with advanced line range and formatting options',
        inputSchema: z.object({
          repo: z.string().describe('Repository in format "owner/repo"'),
          path: z.string().describe('File path in repository'),
          branch: z.string().optional().describe('Branch name, defaults to repository default'),
          includeLineNumbers: z.boolean().optional().describe('Whether to include line numbers in the response (default: false)'),
          startLine: z.number().optional().describe('REQUIRED for files >200 lines: Starting line number (1-indexed) to read from'),
          endLine: z.number().optional().describe('REQUIRED for files >200 lines: Ending line number (1-indexed) to read to. Maximum 150 lines per read'),
          lineRange: z.string().optional().describe('Line range in format "start-end" (e.g., "654-661"). REQUIRED for files >200 lines. Max 200 lines')
        }),
        execute: async ({ repo, path, branch, includeLineNumbers = false, startLine, endLine, lineRange }) => {
          console.log(`[RepoAgent:${requestId.slice(0, 8)}] 🔧 Tool call: github_read_file - Input:`, { repo, path, branch: branch || 'default' })
          try {
            const { owner, repo: repoName } = parseRepoString(repo)
            const response = await octokit.rest.repos.getContent({
              owner,
              repo: repoName,
              path,
              ref: branch
            })

            if (Array.isArray(response.data)) {
              // It's a directory
              const result = {
                success: true,
                type: 'directory',
                contents: response.data.map(item => ({
                  name: item.name,
                  path: item.path,
                  type: item.type,
                  size: item.size,
                  download_url: item.download_url
                }))
              }
              console.log(`[RepoAgent:${requestId.slice(0, 8)}] ✅ github_read_file completed - Directory: ${path} with ${result.contents.length} items`)
              return result
            } else {
              // It's a file - type check before accessing properties
              const fileData = response.data as any
              if (fileData.type === 'file' && fileData.content && fileData.encoding) {
                const fullContent = Buffer.from(fileData.content, 'base64').toString('utf-8')
                const lines = fullContent.split('\n')
                const totalLines = lines.length

                // Parse line range from lineRange parameter if provided
                let actualStartLine = startLine
                let actualEndLine = endLine

                if (lineRange) {
                  const rangeMatch = lineRange.match(/^(\d+)-(\d+)$/)
                  if (rangeMatch) {
                    actualStartLine = parseInt(rangeMatch[1])
                    actualEndLine = parseInt(rangeMatch[2])
                  } else {
                    return {
                      success: false,
                      error: 'Invalid lineRange format. Use "start-end" (e.g., "654-661")'
                    }
                  }
                }

                // Validate line range requirements for large files
                if (totalLines > 200) {
                  if (!actualStartLine || !actualEndLine) {
                    return {
                      success: false,
                      error: `File has ${totalLines} lines (>200). Line range parameters (startLine/endLine or lineRange) are REQUIRED. Maximum 150 lines per read.`
                    }
                  }

                  const requestedLines = actualEndLine - actualStartLine + 1
                  if (requestedLines > 150) {
                    return {
                      success: false,
                      error: `Requested range (${requestedLines} lines) exceeds maximum of 150 lines per read`
                    }
                  }
                }

                // Set defaults for small files if no range specified
                if (!actualStartLine) actualStartLine = 1
                if (!actualEndLine) actualEndLine = totalLines

                // Validate line numbers
                if (actualStartLine < 1 || actualStartLine > totalLines) {
                  return {
                    success: false,
                    error: `startLine ${actualStartLine} is out of range (1-${totalLines})`
                  }
                }
                if (actualEndLine < actualStartLine || actualEndLine > totalLines) {
                  return {
                    success: false,
                    error: `endLine ${actualEndLine} is out of range (${actualStartLine}-${totalLines})`
                  }
                }

                // Extract the requested content
                const requestedLines = lines.slice(actualStartLine - 1, actualEndLine)
                let content = requestedLines.join('\n')

                // Add line numbers if requested
                if (includeLineNumbers) {
                  content = requestedLines
                    .map((line, index) => `${(actualStartLine + index).toString().padStart(4, ' ')}: ${line}`)
                    .join('\n')
                }

                const result = {
                  success: true,
                  type: 'file',
                  path: fileData.path,
                  name: fileData.name,
                  content,
                  size: fileData.size,
                  encoding: fileData.encoding,
                  sha: fileData.sha,
                  totalLines,
                  requestedRange: {
                    startLine: actualStartLine,
                    endLine: actualEndLine,
                    lineCount: actualEndLine - actualStartLine + 1
                  },
                  includeLineNumbers
                }
                console.log(`[RepoAgent:${requestId.slice(0, 8)}] ✅ github_read_file completed - File: ${path} (${result.size} bytes, lines ${actualStartLine}-${actualEndLine})`)
                return result
              } else {
                console.error(`[RepoAgent:${requestId.slice(0, 8)}] ❌ github_read_file failed - Invalid file response`)
                return {
                  success: false,
                  error: 'Invalid file response from GitHub API'
                }
              }
            }
          } catch (error) {
            const errorMsg = `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`
            console.error(`[RepoAgent:${requestId.slice(0, 8)}] ❌ github_read_file failed:`, errorMsg)
            return {
              success: false,
              error: errorMsg
            }
          }
        }
      }),

      github_write_file: tool({
        description: 'Create or update a file in the repository',
        inputSchema: z.object({
          repo: z.string().describe('Repository in format "owner/repo"'),
          path: z.string().describe('File path in repository'),
          content: z.string().describe('File content'),
          message: z.string().describe('Commit message'),
          branch: z.string().optional().describe('Branch name, defaults to repository default')
        }),
        execute: async ({ repo, path, content, message, branch }) => {
          console.log(`[RepoAgent:${requestId.slice(0, 8)}] 🔧 Tool call: github_write_file - Input:`, { repo, path, messageLen: message.length, contentLen: content.length, branch: branch || 'default' })
          try {
            const { owner, repo: repoName } = parseRepoString(repo)

            // Get current file SHA if it exists (for updates)
            let sha: string | undefined
            try {
              const existingFile = await octokit.rest.repos.getContent({
                owner,
                repo: repoName,
                path,
                ref: branch
              })
              if (!Array.isArray(existingFile.data)) {
                sha = existingFile.data.sha
              }
            } catch (error) {
              // File doesn't exist, which is fine for creation
            }

            const response = await octokit.rest.repos.createOrUpdateFileContents({
              owner,
              repo: repoName,
              path,
              message,
              content: Buffer.from(content).toString('base64'),
              sha,
              branch,
              author: {
                name: process.env.PIPILOT_BOT_NAME || 'pipilot-swe-bot',
                email: userEmail || 'noreply@github.com'
              }
            })

            const result = {
              success: true,
              commit: {
                sha: response.data.commit.sha,
                message: response.data.commit.message,
                author: response.data.commit.author,
                url: response.data.commit.html_url
              },
              file: {
                path: response.data.content?.path,
                sha: response.data.content?.sha
              }
            }
            console.log(`[RepoAgent:${requestId.slice(0, 8)}] ✅ github_write_file completed - File: ${path}, Commit: ${result.commit.sha?.slice(0, 8) || 'unknown'}`)
            return result
          } catch (error) {
            const errorMsg = `Failed to write file: ${error instanceof Error ? error.message : 'Unknown error'}`
            console.error(`[RepoAgent:${requestId.slice(0, 8)}] ❌ github_write_file failed:`, errorMsg)
            return {
              success: false,
              error: errorMsg
            }
          }
        }
      }),

      github_delete_file: tool({
        description: 'Delete a file from the repository',
        inputSchema: z.object({
          repo: z.string().describe('Repository in format "owner/repo"'),
          path: z.string().describe('File path in repository'),
          message: z.string().describe('Commit message'),
          branch: z.string().optional().describe('Branch name, defaults to repository default')
        }),
        execute: async ({ repo, path, message, branch }) => {
          console.log(`[RepoAgent:${requestId.slice(0, 8)}] 🔧 Tool call: github_delete_file - Input:`, { repo, path, message, branch: branch || 'default' })
          try {
            const { owner, repo: repoName } = parseRepoString(repo)

            // Get current file SHA
            const existingFile = await octokit.rest.repos.getContent({
              owner,
              repo: repoName,
              path,
              ref: branch
            })

            if (Array.isArray(existingFile.data)) {
              console.error(`[RepoAgent:${requestId.slice(0, 8)}] ❌ github_delete_file failed - Cannot delete directory: ${path}`)
              return {
                success: false,
                error: 'Cannot delete a directory'
              }
            }

            const response = await octokit.rest.repos.deleteFile({
              owner,
              repo: repoName,
              path,
              message,
              sha: existingFile.data.sha,
              branch,
              author: {
                name: process.env.PIPILOT_BOT_NAME || 'pipilot-swe-bot',
                email: userEmail || 'noreply@github.com'
              }
            })

            const result = {
              success: true,
              commit: {
                sha: response.data.commit.sha,
                message: response.data.commit.message,
                url: response.data.commit.html_url
              }
            }
            console.log(`[RepoAgent:${requestId.slice(0, 8)}] ✅ github_delete_file completed - File: ${path}, Commit: ${result.commit.sha?.slice(0, 8) || 'unknown'}`)
            return result
          } catch (error) {
            const errorMsg = `Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`
            console.error(`[RepoAgent:${requestId.slice(0, 8)}] ❌ github_delete_file failed:`, errorMsg)
            return {
              success: false,
              error: errorMsg
            }
          }
        }
      }),

      github_list_files: tool({
        description: 'List files and directories in a repository path',
        inputSchema: z.object({
          repo: z.string().describe('Repository in format "owner/repo"'),
          path: z.string().optional().describe('Directory path, empty for root'),
          branch: z.string().optional().describe('Branch name, defaults to repository default')
        }),
        execute: async ({ repo, path = '', branch }) => {
          try {
            const { owner, repo: repoName } = parseRepoString(repo)
            const response = await octokit.rest.repos.getContent({
              owner,
              repo: repoName,
              path,
              ref: branch
            })

            if (!Array.isArray(response.data)) {
              return {
                success: false,
                error: 'Path is not a directory'
              }
            }

            return {
              success: true,
              path,
              contents: response.data.map(item => ({
                name: item.name,
                path: item.path,
                type: item.type,
                size: item.size,
                download_url: item.download_url,
                sha: item.sha
              }))
            }
          } catch (error) {
            return {
              success: false,
              error: `Failed to list files: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
          }
        }
      }),

      // Branch Management
      github_create_branch: tool({
        description: 'Create a new branch in the repository',
        inputSchema: z.object({
          repo: z.string().describe('Repository in format "owner/repo"'),
          branch: z.string().describe('New branch name'),
          source_branch: z.string().optional().describe('Source branch to branch from, defaults to default branch')
        }),
        execute: async ({ repo, branch, source_branch }) => {
          try {
            const { owner, repo: repoName } = parseRepoString(repo)

            // Get source branch SHA
            const sourceRef = await octokit.rest.git.getRef({
              owner,
              repo: repoName,
              ref: `heads/${source_branch || 'main'}`
            })

            // Create new branch
            const response = await octokit.rest.git.createRef({
              owner,
              repo: repoName,
              ref: `refs/heads/${branch}`,
              sha: sourceRef.data.object.sha
            })

            return {
              success: true,
              branch: {
                name: branch,
                sha: response.data.object.sha,
                ref: response.data.ref
              }
            }
          } catch (error) {
            return {
              success: false,
              error: `Failed to create branch: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
          }
        }
      }),

      // Search and History
      github_search_code: tool({
        description: 'Search for code patterns in the repository',
        inputSchema: z.object({
          repo: z.string().describe('Repository in format "owner/repo"'),
          query: z.string().describe('Search query'),
          path: z.string().optional().describe('Limit search to specific path'),
          extension: z.string().optional().describe('File extension filter (e.g., "js", "py")')
        }),
        execute: async ({ repo, query, path, extension }) => {
          try {
            const searchQuery = `repo:${repo} ${query}${path ? ` path:${path}` : ''}${extension ? ` extension:${extension}` : ''}`

            const response = await octokit.rest.search.code({
              q: searchQuery,
              per_page: 30
            })

            return {
              success: true,
              total_count: response.data.total_count,
              items: response.data.items.map(item => ({
                name: item.name,
                path: item.path,
                sha: item.sha,
                html_url: item.html_url,
                repository: {
                  full_name: item.repository.full_name,
                  html_url: item.repository.html_url
                }
              }))
            }
          } catch (error) {
            return {
              success: false,
              error: `Failed to search code: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
          }
        }
      }),

      github_get_commits: tool({
        description: 'Get commit history for a repository or specific path',
        inputSchema: z.object({
          repo: z.string().describe('Repository in format "owner/repo"'),
          path: z.string().optional().describe('Limit to commits affecting this path'),
          branch: z.string().optional().describe('Branch name'),
          per_page: z.number().min(1).max(100).optional().describe('Number of commits to return')
        }),
        execute: async ({ repo, path, branch, per_page = 30 }) => {
          try {
            const { owner, repo: repoName } = parseRepoString(repo)
            const response = await octokit.rest.repos.listCommits({
              owner,
              repo: repoName,
              path,
              sha: branch,
              per_page
            })

            return {
              success: true,
              commits: response.data.map(commit => ({
                sha: commit.sha,
                message: commit.commit.message,
                author: {
                  name: commit.commit.author?.name,
                  email: commit.commit.author?.email,
                  date: commit.commit.author?.date
                },
                committer: {
                  name: commit.commit.committer?.name,
                  email: commit.commit.committer?.email,
                  date: commit.commit.committer?.date
                },
                html_url: commit.html_url,
                parents: commit.parents.map(p => p.sha)
              }))
            }
          } catch (error) {
            return {
              success: false,
              error: `Failed to get commits: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
          }
        }
      }),

      github_get_commit: tool({
        description: 'Get detailed information about a specific commit including files changed, additions, deletions, and full diff',
        inputSchema: z.object({
          repo: z.string().describe('Repository in format "owner/repo"'),
          sha: z.string().describe('Commit SHA or ref (branch/tag name)')
        }),
        execute: async ({ repo, sha }) => {
          try {
            const { owner, repo: repoName } = parseRepoString(repo)
            const commit = await octokit.repos.getCommit({
              owner,
              repo: repoName,
              ref: sha
            })

            return {
              success: true,
              commit: {
                sha: commit.data.sha,
                message: commit.data.commit.message,
                author: {
                  name: commit.data.commit.author?.name,
                  email: commit.data.commit.author?.email,
                  date: commit.data.commit.author?.date
                },
                committer: {
                  name: commit.data.commit.committer?.name,
                  email: commit.data.commit.committer?.email,
                  date: commit.data.commit.committer?.date
                },
                html_url: commit.data.html_url,
                parentShas: commit.data.parents.map(p => p.sha),
                stats: commit.data.stats ? {
                  total: commit.data.stats.total,
                  additions: commit.data.stats.additions,
                  deletions: commit.data.stats.deletions
                } : undefined,
                files: (commit.data.files || []).map(file => ({
                  filename: file.filename,
                  status: file.status,
                  additions: file.additions,
                  deletions: file.deletions,
                  changes: file.changes,
                  patch: file.patch || 'No patch available',
                  previousFilename: file.previous_filename
                }))
              }
            }
          } catch (error) {
            return {
              success: false,
              error: `Failed to get commit: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
          }
        }
      }),

      // Revert/Reset to specific commit
      github_revert_to_commit: tool({
        description: 'Revert all changes after a specific commit by moving the branch pointer to that commit (force reset). WARNING: This is destructive and cannot be undone.',
        inputSchema: z.object({
          repo: z.string().describe('Repository in "owner/repo" format'),
          branch: z.string().describe('Branch name to revert (e.g., "main", "dev")'),
          sha: z.string().describe('Commit SHA to revert to - all changes after this commit will be removed')
        }),
        execute: async ({ repo, branch, sha }) => {
          try {
            const [owner, repoName] = repo.split('/')
            if (!owner || !repoName) {
              return {
                success: false,
                error: 'Invalid repo format. Use "owner/repo"'
              }
            }

            const result = await octokit.git.updateRef({
              owner,
              repo: repoName,
              ref: `heads/${branch}`,
              sha,
              force: true
            })

            return {
              success: true,
              message: `Successfully reverted ${branch} to commit ${sha}`,
              previousSha: result.data.object.sha,
              url: result.data.url
            }
          } catch (error) {
            return {
              success: false,
              error: `Failed to revert to commit: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
          }
        }
      }),

      // Pull Requests
      github_create_pull_request: tool({
        description: 'Create a pull request between branches',
        inputSchema: z.object({
          repo: z.string().describe('Repository in format "owner/repo"'),
          title: z.string().describe('Pull request title'),
          head: z.string().describe('Head branch (source of changes)'),
          base: z.string().describe('Base branch (target for merge)'),
          body: z.string().optional().describe('Pull request description'),
          draft: z.boolean().optional().describe('Create as draft PR')
        }),
        execute: async ({ repo, title, head, base, body, draft = false }) => {
          try {
            const { owner, repo: repoName } = parseRepoString(repo)
            const response = await octokit.rest.pulls.create({
              owner,
              repo: repoName,
              title,
              head,
              base,
              body,
              draft
            })

            return {
              success: true,
              pull_request: {
                number: response.data.number,
                title: response.data.title,
                html_url: response.data.html_url,
                state: response.data.state,
                draft: response.data.draft,
                merged: response.data.merged,
                mergeable: response.data.mergeable
              }
            }
          } catch (error) {
            return {
              success: false,
              error: `Failed to create pull request: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
          }
        }
      }),

      // Advanced Code Analysis Tools
      github_semantic_search: tool({
        description: 'Advanced semantic code search and analysis tool with cross-reference tracking and result grouping. Finds code patterns, structures, and relationships with high accuracy. Supports natural language queries, framework-specific patterns, and detailed code analysis. Uses session storage for fast, comprehensive analysis.',
        inputSchema: z.object({
          repo: z.string().describe('Repository in format "owner/repo"'),
          query: z.string().describe('Natural language description of what to search for (e.g., "find React components with useState", "show API endpoints", "locate error handling", "find database models")'),
          path: z.string().optional().describe('Optional: Specific path to search within'),
          fileType: z.string().optional().describe('Optional: Filter by file type (e.g., "tsx", "ts", "js", "py", "md")'),
          maxResults: z.number().optional().describe('Maximum number of results to return (default: 20)'),
          analysisDepth: z.enum(['basic', 'detailed', 'comprehensive']).optional().describe('Analysis depth: basic (fast), detailed (balanced), comprehensive (thorough but slower)'),
          includeDependencies: z.boolean().optional().describe('Include related code dependencies and relationships (default: false)'),
          enableCrossReferences: z.boolean().optional().describe('Enable cross-reference tracking to find all usages of functions/variables (default: false)'),
          groupByFunctionality: z.boolean().optional().describe('Group results by functionality (components, APIs, utilities, etc.) (default: false)'),
          branch: z.string().optional().describe('Branch name, defaults to repository default')
        }),
        execute: async ({ repo, query, path, fileType, maxResults = 20, analysisDepth = 'detailed', includeDependencies = false, enableCrossReferences = false, groupByFunctionality = false, branch }) => {
          try {
            const { owner, repo: repoName } = parseRepoString(repo)

            // Get repository info for metadata
            const repoInfo = await octokit.rest.repos.get({ owner, repo: repoName })
            const defaultBranch = branch || repoInfo.data.default_branch
            const repoKey = `${repo}-${defaultBranch}`

            // Import repository into session storage if not already present
            if (!repoSessionStorage.has(repoKey)) {
              console.log(`[RepoAgent] 📦 Importing repository for semantic search: https://github.com/${repo} at ${defaultBranch}`)
              const repoUrl = `https://github.com/${repo}`
              await importGithubRepoForSession(repoUrl, repoKey, octokit, defaultBranch)
            }

            const sessionData = repoSessionStorage.get(repoKey)
            if (!sessionData) {
              return {
                success: false,
                error: 'Failed to load repository files into session',
                query
              }
            }

            const { files: sessionFiles } = sessionData
            let filesToSearch = Array.from(sessionFiles.values())

            // Filter by path if specified
            if (path) {
              filesToSearch = filesToSearch.filter(f => f.path.startsWith(path))
            }

            // Filter by file type if specified
            if (fileType) {
              const extensions = fileType.split(',').map(ext => ext.trim().toLowerCase())
              filesToSearch = filesToSearch.filter(f => {
                const ext = f.path.split('.').pop()?.toLowerCase()
                return ext && extensions.includes(ext)
              })
            }

            const results: any[] = []

            // Enhanced semantic code analysis with framework-specific patterns
            const searchPatterns = [
              // React/TypeScript specific patterns
              {
                type: 'react_component',
                regex: /^\s*(export\s+)?(const|function)\s+(\w+)\s*[=:]\s*(React\.)?(memo\()?(\([^)]*\)\s*=>|function)/gm,
                description: 'React component definition'
              },
              {
                type: 'typescript_interface',
                regex: /^\s*(export\s+)?interface\s+(\w+)/gm,
                description: 'TypeScript interface definition'
              },
              {
                type: 'typescript_type',
                regex: /^\s*(export\s+)?type\s+(\w+)\s*=/gm,
                description: 'TypeScript type definition'
              },
              {
                type: 'api_route',
                regex: /^\s*export\s+(async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH)/gm,
                description: 'Next.js API route handler'
              },
              {
                type: 'database_query',
                regex: /\b(SELECT|INSERT|UPDATE|DELETE)\b.*\bFROM\b|\bCREATE\s+TABLE\b|\bALTER\s+TABLE\b/gi,
                description: 'Database query or schema definition'
              },
              {
                type: 'async_function',
                regex: /^\s*(export\s+)?async\s+(function|const)\s+(\w+)/gm,
                description: 'Async function definition'
              },
              {
                type: 'hook_definition',
                regex: /^\s*(export\s+)?function\s+use\w+/gm,
                description: 'React hook definition'
              },
              {
                type: 'error_handling',
                regex: /\btry\s*\{|\bcatch\s*\(|\bthrow\s+new\b|\bError\s*\(/gi,
                description: 'Error handling code'
              },
              {
                type: 'validation_schema',
                regex: /\b(z\.)?(object|array|string|number|boolean)\(\)|\.refine\(|schema\.parse\b/gi,
                description: 'Zod validation schema'
              },
              {
                type: 'test_case',
                regex: /^\s*(it|test|describe)\s*\(/gm,
                description: 'Test case definition'
              },
              {
                type: 'configuration',
                regex: /\b(process\.env|NEXT_PUBLIC_|REACT_APP_)\b|\bconfig\b.*=|\bsettings\b.*=/gi,
                description: 'Configuration or environment variables'
              },
              {
                type: 'styling',
                regex: /\bclassName\s*=|\bstyle\s*=|\btailwind\b|\bcss\b|\bsass\b/gi,
                description: 'Styling and CSS classes'
              },
              // Generic patterns for broader coverage
              {
                type: 'function',
                regex: /^\s*(export\s+)?(function|const|let|var)\s+(\w+)\s*[=({]/gm,
                description: 'Function or method definition'
              },
              {
                type: 'class',
                regex: /^\s*(export\s+)?(class|interface|type)\s+(\w+)/gm,
                description: 'Class, interface, or type definition'
              },
              {
                type: 'import',
                regex: /^\s*import\s+.*from\s+['"`].*['"`]/gm,
                description: 'Import statement'
              },
              {
                type: 'export',
                regex: /^\s*export\s+/gm,
                description: 'Export statement'
              },
              // Semantic text search with context awareness
              {
                type: 'semantic_match',
                regex: new RegExp(`\\b${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'),
                description: 'Semantic code match'
              }
            ]

            // Search through each file
            for (const file of filesToSearch) {
              if (!file.content || typeof file.content !== 'string') continue

              const content = file.content
              const lines = content.split('\n')
              const lowerQuery = query.toLowerCase()

              // Search for each pattern
              for (const pattern of searchPatterns) {
                let match
                while ((match = pattern.regex.exec(content)) !== null && results.length < maxResults) {
                  // Calculate line number (1-indexed)
                  const matchIndex = match.index
                  let lineNumber = 1
                  let charCount = 0

                  for (let i = 0; i < lines.length; i++) {
                    charCount += lines[i].length + 1 // +1 for newline
                    if (charCount > matchIndex) {
                      lineNumber = i + 1
                      break
                    }
                  }

                  // Calculate relevance score based on pattern type and context
                  let relevanceScore = 1
                  switch (pattern.type) {
                    case 'react_component':
                    case 'api_route':
                    case 'async_function':
                      relevanceScore = 10
                      break
                    case 'typescript_interface':
                    case 'typescript_type':
                    case 'hook_definition':
                      relevanceScore = 8
                      break
                    case 'database_query':
                    case 'validation_schema':
                    case 'error_handling':
                      relevanceScore = 7
                      break
                    case 'test_case':
                    case 'configuration':
                      relevanceScore = 6
                      break
                    case 'function':
                    case 'class':
                      relevanceScore = 5
                      break
                    case 'styling':
                    case 'import':
                    case 'export':
                      relevanceScore = 3
                      break
                    default:
                      relevanceScore = 2
                  }

                  // Boost score for exact matches and word boundaries
                  if (match[0].toLowerCase() === query.toLowerCase()) {
                    relevanceScore += 5
                  }
                  if (new RegExp(`\\b${query}\\b`, 'i').test(match[0])) {
                    relevanceScore += 3
                  }

                  // Extract context around the match
                  const startLine = Math.max(1, lineNumber - 2)
                  const endLine = Math.min(lines.length, lineNumber + 2)
                  const contextLines = lines.slice(startLine - 1, endLine)
                  const contextWithNumbers = contextLines.map((line: string, idx: number) =>
                    `${String(startLine + idx).padStart(4, ' ')}: ${line}`
                  ).join('\n')

                  // Highlight the match in context
                  const highlightedContext = contextWithNumbers.replace(
                    new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
                    '**$&**'
                  )

                  // Check for dependencies if requested
                  let dependencies: string[] = []
                  if (includeDependencies && pattern.type === 'import') {
                    const importMatch = match[0].match(/from\s+['"`]([^'"`]+)['"`]/)
                    if (importMatch) {
                      dependencies.push(importMatch[1])
                    }
                  }

                  results.push({
                    file: file.path,
                    type: pattern.type,
                    description: pattern.description,
                    lineNumber,
                    match: match[0].trim(),
                    context: highlightedContext,
                    fullMatch: match[0],
                    relevanceScore,
                    dependencies: dependencies.length > 0 ? dependencies : undefined
                  })

                  // Prevent infinite loops for global regex
                  if (!pattern.regex.global) break
                }
              }

              if (results.length >= maxResults) break
            }

            // Sort results by relevance score and deduplicate
            const uniqueResults = results
              .sort((a, b) => b.relevanceScore - a.relevanceScore)
              .filter((result, index, arr) =>
                index === 0 || !(arr[index - 1].file === result.file &&
                  arr[index - 1].lineNumber === result.lineNumber &&
                  arr[index - 1].match === result.match)
              )
              .slice(0, maxResults)

            // Perform dependency analysis if requested
            let dependencyAnalysis: any = null
            if (includeDependencies && uniqueResults.length > 0) {
              const allDependencies = new Set<string>()
              const dependencyMap = new Map<string, string[]>()

              // Collect all dependencies from results
              uniqueResults.forEach(result => {
                if (result.dependencies) {
                  result.dependencies.forEach((dep: string) => allDependencies.add(dep))
                }
              })

              // Analyze dependency relationships
              filesToSearch.forEach((file: any) => {
                if (!file.content || file.isDirectory) return

                const content = file.content
                const imports = content.match(/^\s*import\s+.*from\s+['"`]([^'"`]+)['"`]/gm) || []

                imports.forEach((importStmt: string) => {
                  const match = importStmt.match(/from\s+['"`]([^'"`]+)['"`]/)
                  if (match) {
                    const dep = match[1]
                    if (allDependencies.has(dep)) {
                      if (!dependencyMap.has(file.path)) {
                        dependencyMap.set(file.path, [])
                      }
                      dependencyMap.get(file.path)!.push(dep)
                    }
                  }
                })
              })

              dependencyAnalysis = {
                totalDependencies: allDependencies.size,
                dependencyFiles: Array.from(dependencyMap.entries()).map(([file, deps]) => ({
                  file,
                  imports: deps
                })),
                uniqueDependencies: Array.from(allDependencies)
              }
            }

            // Perform cross-reference tracking if requested
            let crossReferences: any[] = []
            if (enableCrossReferences && uniqueResults.length > 0) {
              // Find all function/variable/class definitions from the results
              const definitions = uniqueResults.filter(result =>
                ['function', 'async_function', 'react_component', 'hook_definition', 'class', 'typescript_interface', 'typescript_type'].includes(result.type)
              )

              // Extract identifiers from definitions
              const identifiers = definitions.map(def => {
                // Extract the identifier name from the match
                const match = def.match
                if (def.type === 'react_component') {
                  const componentMatch = match.match(/(?:const|function)\s+(\w+)/)
                  return componentMatch ? componentMatch[1] : null
                } else if (def.type === 'typescript_interface' || def.type === 'typescript_type') {
                  const typeMatch = match.match(/(?:interface|type)\s+(\w+)/)
                  return typeMatch ? typeMatch[1] : null
                } else if (def.type === 'hook_definition') {
                  const hookMatch = match.match(/function\s+(use\w+)/)
                  return hookMatch ? hookMatch[1] : null
                } else if (def.type === 'function' || def.type === 'async_function') {
                  const funcMatch = match.match(/(?:function|const|let|var)\s+(\w+)/)
                  return funcMatch ? funcMatch[1] : null
                } else if (def.type === 'class') {
                  const classMatch = match.match(/(?:class|interface|type)\s+(\w+)/)
                  return classMatch ? classMatch[1] : null
                }
                return null
              }).filter(Boolean)

              // Search for usages of these identifiers across all files
              const usageResults: any[] = []
              for (const file of filesToSearch) {
                if (!file.content || file.isDirectory) continue

                const content = file.content
                const fileLines = content.split('\n')

                identifiers.forEach(identifier => {
                  // Create regex to find usages (word boundaries, property access, function calls)
                  const usageRegex = new RegExp(`\\b${identifier}\\b`, 'g')
                  let match: RegExpExecArray | null
                  while ((match = usageRegex.exec(content)) !== null) {
                    // Ensure match is not null (TypeScript guard)
                    if (!match) continue

                    const matchIndex = match.index

                    // Skip the definition itself
                    const isDefinition = definitions.some(def =>
                      def.file === file.path &&
                      Math.abs(def.lineNumber - (content.substring(0, matchIndex).split('\n').length)) <= 2
                    )
                    if (isDefinition) continue

                    let lineNumber = 1
                    let charCount = 0
                    for (let i = 0; i < fileLines.length; i++) {
                      charCount += fileLines[i].length + 1
                      if (charCount > matchIndex) {
                        lineNumber = i + 1
                        break
                      }
                    }

                    // Extract context
                    const startLine = Math.max(1, lineNumber - 1)
                    const endLine = Math.min(fileLines.length, lineNumber + 1)
                    const contextLines = fileLines.slice(startLine - 1, endLine)
                    const contextWithNumbers = contextLines.map((line: string, idx: number) =>
                      `${String(startLine + idx).padStart(4, ' ')}: ${line}`
                    ).join('\n')

                    usageResults.push({
                      identifier,
                      file: file.path,
                      lineNumber,
                      context: contextWithNumbers,
                      usage: match[0]
                    })
                  }
                })
              }

              crossReferences = usageResults
            }

            // Group results by functionality if requested
            let groupedResults: any = null
            if (groupByFunctionality && uniqueResults.length > 0) {
              const groups: { [key: string]: any[] } = {
                components: [],
                apis: [],
                utilities: [],
                types: [],
                configuration: [],
                tests: [],
                styling: [],
                other: []
              }

              uniqueResults.forEach(result => {
                switch (result.type) {
                  case 'react_component':
                    groups.components.push(result)
                    break
                  case 'api_route':
                  case 'async_function':
                    groups.apis.push(result)
                    break
                  case 'hook_definition':
                  case 'function':
                    groups.utilities.push(result)
                    break
                  case 'typescript_interface':
                  case 'typescript_type':
                    groups.types.push(result)
                    break
                  case 'configuration':
                    groups.configuration.push(result)
                    break
                  case 'test_case':
                    groups.tests.push(result)
                    break
                  case 'styling':
                    groups.styling.push(result)
                    break
                  default:
                    groups.other.push(result)
                }
              })

              // Remove empty groups
              Object.keys(groups).forEach(key => {
                if (groups[key].length === 0) {
                  delete groups[key]
                }
              })

              groupedResults = groups
            }

            return {
              success: true,
              message: `Found ${uniqueResults.length} code sections matching "${query}" (sorted by relevance)`,
              query,
              results: uniqueResults,
              totalResults: uniqueResults.length,
              dependencyAnalysis,
              crossReferences: crossReferences.length > 0 ? crossReferences : undefined,
              groupedResults,
              repository: {
                full_name: repo,
                default_branch: defaultBranch,
                language: repoInfo.data.language
              }
            }
          } catch (error) {
            return {
              success: false,
              error: `Failed to perform semantic search: ${error instanceof Error ? error.message : 'Unknown error'}`,
              query
            }
          }
        }
      }),

      github_replace_string: tool({
        description: 'Advanced string replacement tool for editing files in GitHub repositories. Supports regex patterns, multiple replacements, and exact string matching. More powerful than basic file write operations.',
        inputSchema: z.object({
          repo: z.string().describe('Repository in format "owner/repo"'),
          path: z.string().describe('File path in repository'),
          oldString: z.string().describe('The exact string to replace (must match exactly including whitespace and indentation)'),
          newString: z.string().describe('The new string to replace with'),
          message: z.string().describe('Commit message for the change'),
          useRegex: z.boolean().optional().describe('Whether to treat oldString as regex pattern (default: false)'),
          replaceAll: z.boolean().optional().describe('Whether to replace all occurrences (default: false, replaces first occurrence only)'),
          caseInsensitive: z.boolean().optional().describe('Whether regex matching should be case insensitive (default: false)'),
          branch: z.string().optional().describe('Branch name, defaults to repository default')
        }),
        execute: async ({ repo, path, oldString, newString, message, useRegex = false, replaceAll = false, caseInsensitive = false, branch }) => {
          console.log(`[RepoAgent:${requestId.slice(0, 8)}] 🔧 Tool call: github_replace_string - Input:`, { repo, path, oldStringLen: oldString.length, newStringLen: newString.length, useRegex, replaceAll, branch: branch || 'default' })
          try {
            const { owner, repo: repoName } = parseRepoString(repo)

            // Get current file content
            const fileResponse = await octokit.rest.repos.getContent({
              owner,
              repo: repoName,
              path,
              ref: branch
            })

            if (Array.isArray(fileResponse.data)) {
              return {
                success: false,
                error: 'Cannot replace strings in directories'
              }
            }

            const fileData = fileResponse.data as any
            const currentContent = Buffer.from(fileData.content, 'base64').toString('utf-8')

            // Perform the replacement
            let updatedContent: string
            let replacementCount = 0

            if (useRegex) {
              const flags = caseInsensitive ? 'gi' : 'g'
              const regex = new RegExp(oldString, flags)

              if (replaceAll) {
                updatedContent = currentContent.replace(regex, newString)
                const matches = currentContent.match(regex)
                replacementCount = matches ? matches.length : 0
              } else {
                updatedContent = currentContent.replace(regex, newString)
                replacementCount = currentContent.match(regex) ? 1 : 0
              }
            } else {
              if (replaceAll) {
                let count = 0
                updatedContent = currentContent
                let index = updatedContent.indexOf(oldString)
                while (index !== -1) {
                  updatedContent = updatedContent.substring(0, index) + newString + updatedContent.substring(index + oldString.length)
                  count++
                  index = updatedContent.indexOf(oldString, index + newString.length)
                }
                replacementCount = count
              } else {
                const index = currentContent.indexOf(oldString)
                if (index === -1) {
                  return {
                    success: false,
                    error: 'String to replace not found in file'
                  }
                }
                updatedContent = currentContent.substring(0, index) + newString + currentContent.substring(index + oldString.length)
                replacementCount = 1
              }
            }

            // Check if content actually changed
            if (updatedContent === currentContent) {
              return {
                success: false,
                error: 'No replacements were made - string not found or no changes needed'
              }
            }

            // Commit the changes
            const updateResponse = await octokit.rest.repos.createOrUpdateFileContents({
              owner,
              repo: repoName,
              path,
              message,
              content: Buffer.from(updatedContent).toString('base64'),
              sha: fileData.sha,
              branch,
              author: {
                name: process.env.PIPILOT_BOT_NAME || 'pipilot-swe-bot',
                email: userEmail || 'noreply@github.com'
              }
            })

            const result = {
              success: true,
              replacements_made: replacementCount,
              commit: {
                sha: updateResponse.data.commit.sha,
                message: updateResponse.data.commit.message,
                author: updateResponse.data.commit.author,
                url: updateResponse.data.commit.html_url
              },
              file: {
                path: updateResponse.data.content?.path,
                sha: updateResponse.data.content?.sha,
                previous_sha: fileData.sha
              },
              changes: {
                old_length: currentContent.length,
                new_length: updatedContent.length,
                diff: updatedContent.length - currentContent.length
              }
            }

            console.log(`[RepoAgent:${requestId.slice(0, 8)}] ✅ github_replace_string completed - File: ${path}, Replacements: ${replacementCount}, Commit: ${result.commit.sha?.slice(0, 8) || 'unknown'}`)
            return result
          } catch (error) {
            const errorMsg = `Failed to replace string: ${error instanceof Error ? error.message : 'Unknown error'}`
            console.error(`[RepoAgent:${requestId.slice(0, 8)}] ❌ github_replace_string failed:`, errorMsg)
            return {
              success: false,
              error: errorMsg
            }
          }
        }
      }),

      github_grep_search: tool({
        description: 'Elite multi-strategy search engine for GitHub repositories. Combines literal text search, regex patterns, intelligent code pattern detection, and semantic analysis. Uses session storage for comprehensive, fast analysis.',
        inputSchema: z.object({
          repo: z.string().describe('Repository in format "owner/repo"'),
          query: z.string().describe('Search pattern - can be literal text, regex, or natural language'),
          path: z.string().optional().describe('Limit search to specific path or file pattern'),
          fileType: z.string().optional().describe('Filter by file type/extension'),
          useRegex: z.boolean().optional().describe('Treat query as regex pattern (default: false)'),
          caseInsensitive: z.boolean().optional().describe('Case insensitive search (default: false)'),
          maxResults: z.number().optional().describe('Maximum results to return (default: 50)'),
          branch: z.string().optional().describe('Branch name, defaults to repository default'),
          contextLines: z.number().optional().describe('Lines of context around matches (default: 2)')
        }),
        execute: async ({ repo, query, path, fileType, useRegex = false, caseInsensitive = false, maxResults = 50, branch, contextLines = 2 }) => {
          try {
            const { owner, repo: repoName } = parseRepoString(repo)

            // Get repository info for metadata
            const repoInfo = await octokit.rest.repos.get({ owner, repo: repoName })
            const defaultBranch = branch || repoInfo.data.default_branch
            const repoKey = `${repo}-${defaultBranch}`

            // Import repository into session storage if not already present
            if (!repoSessionStorage.has(repoKey)) {
              console.log(`[RepoAgent] 📦 Importing repository for grep search: https://github.com/${repo} at ${defaultBranch}`)
              const repoUrl = `https://github.com/${repo}`
              await importGithubRepoForSession(repoUrl, repoKey, octokit, defaultBranch)
            }

            const sessionData = repoSessionStorage.get(repoKey)
            if (!sessionData) {
              return {
                success: false,
                error: 'Failed to load repository files into session',
                query
              }
            }

            const { files: sessionFiles } = sessionData
            let filesToSearch = Array.from(sessionFiles.values())

            // Filter by path if specified
            if (path) {
              filesToSearch = filesToSearch.filter(f => f.path.startsWith(path))
            }

            // Filter by file type if specified
            if (fileType) {
              const extensions = fileType.split(',').map(ext => ext.trim().toLowerCase())
              filesToSearch = filesToSearch.filter(f => {
                const ext = f.path.split('.').pop()?.toLowerCase()
                return ext && extensions.includes(ext)
              })
            }

            // Perform comprehensive grep search on all files
            const enhancedResults = []
            const regexFlags = caseInsensitive ? 'gi' : 'g'
            const searchRegex = useRegex ? new RegExp(query, regexFlags) : new RegExp(escapeRegExp(query), regexFlags)

            for (const file of filesToSearch) {
              if (!file.content || typeof file.content !== 'string') continue

              const content = file.content
              const lines = content.split('\n')
              const fileMatches = []

              for (let i = 0; i < lines.length; i++) {
                const line = lines[i]
                const lineMatches = []

                let match
                while ((match = searchRegex.exec(line)) !== null) {
                  lineMatches.push({
                    match: match[0],
                    start: match.index,
                    end: match.index + match[0].length,
                    groups: match.groups || {}
                  })

                  if (!useRegex) break // For literal searches, only find first match per line
                }

                if (lineMatches.length > 0) {
                  // Get context lines
                  const startLine = Math.max(0, i - contextLines)
                  const endLine = Math.min(lines.length - 1, i + contextLines)
                  const context = lines.slice(startLine, endLine + 1)

                  fileMatches.push({
                    lineNumber: i + 1,
                    line: line,
                    matches: lineMatches,
                    context: {
                      startLine: startLine + 1,
                      endLine: endLine + 1,
                      lines: context
                    }
                  })
                }
              }

              if (fileMatches.length > 0) {
                enhancedResults.push({
                  file: {
                    name: file.path.split('/').pop() || file.path,
                    path: file.path,
                    sha: file.sha || 'session',
                    html_url: `https://github.com/${repo}/blob/${defaultBranch}/${file.path}`,
                    language: detectLanguage(file.path, content),
                    size: content.length,
                    lines: lines.length
                  },
                  matches: fileMatches,
                  total_matches: fileMatches.length
                })

                if (enhancedResults.length >= maxResults) break
              }
            }

            return {
              success: true,
              query,
              strategy: 'session-storage',
              total_files_searched: filesToSearch.length,
              files_with_matches: enhancedResults.length,
              repository: {
                full_name: repo,
                default_branch: defaultBranch,
                language: repoInfo.data.language
              },
              results: enhancedResults
            }
          } catch (error) {
            return {
              success: false,
              error: `Failed to perform grep search: ${error instanceof Error ? error.message : 'Unknown error'}`,
              query
            }
          }
        }
      }),

      // Advanced File Editing Tool
      github_edit_file: tool({
        description: 'Edit an existing file in GitHub repository using search/replace blocks with advanced options. Supports regex patterns, multiple replacements. Uses Git diff-style format for precise edits. IMPORTANT: If this tool fails more than 3 times consecutively on the same file, automatically switch to using the github_write_file tool instead.',
        inputSchema: z.object({
          repo: z.string().describe('Repository in format "owner/repo"'),
          path: z.string().describe('File path in repository'),
          searchReplaceBlock: z.string().describe(`Search/replace block in Git diff format:
<<<<<<< SEARCH
[exact code to find - include sufficient context]
=======
[new code to replace with]
>>>>>>> REPLACE`),
          message: z.string().describe('Commit message for the change'),
          useRegex: z.boolean().optional().describe('Whether to treat search as regex pattern (default: false)'),
          replaceAll: z.boolean().optional().describe('Whether to replace all occurrences (default: false, replaces first occurrence only)'),
          branch: z.string().optional().describe('Branch name, defaults to repository default')
        }),
        execute: async ({ repo, path, searchReplaceBlock, message, useRegex = false, replaceAll = false, branch }) => {
          console.log(`[RepoAgent:${requestId.slice(0, 8)}] 🔧 Tool call: github_edit_file - Input:`, { repo, path, messageLen: message.length, branch: branch || 'default' })
          try {
            const { owner, repo: repoName } = parseRepoString(repo)

            // Parse the search/replace block using line-by-line parsing (more efficient)
            const SEARCH_START = '<<<<<<< SEARCH'
            const DIVIDER = '======='
            const REPLACE_END = '>>>>>>> REPLACE'

            const lines = searchReplaceBlock.split('\n')
            let searchLines: string[] = []
            let replaceLines: string[] = []
            let mode: 'none' | 'search' | 'replace' = 'none'

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i]

              if (line.trim() === SEARCH_START) {
                mode = 'search'
              } else if (line.trim() === DIVIDER && mode === 'search') {
                mode = 'replace'
              } else if (line.trim() === REPLACE_END && mode === 'replace') {
                break // End of block
              } else if (mode === 'search') {
                searchLines.push(line)
              } else if (mode === 'replace') {
                replaceLines.push(line)
              }
            }

            const oldString = searchLines.join('\n')
            const newString = replaceLines.join('\n')

            if (!oldString && !newString) {
              return {
                success: false,
                error: 'Invalid search/replace block format. Must contain <<<<<<< SEARCH, =======, and >>>>>>> REPLACE markers.'
              }
            }

            // Get current file content
            const fileResponse = await octokit.rest.repos.getContent({
              owner,
              repo: repoName,
              path,
              ref: branch
            })

            if (Array.isArray(fileResponse.data)) {
              return {
                success: false,
                error: 'Cannot edit directories'
              }
            }

            const fileData = fileResponse.data as any
            const currentContent = Buffer.from(fileData.content, 'base64').toString('utf-8')

            // Perform the replacement (simplified logic from chat-v2)
            let updatedContent: string
            let replacementCount = 0

            if (useRegex) {
              const regexFlags = replaceAll ? 'g' : ''
              const regex = new RegExp(oldString, regexFlags)

              if (regex.test(currentContent)) {
                updatedContent = currentContent.replace(regex, newString)
                replacementCount = replaceAll ? (currentContent.match(regex) || []).length : 1
              } else {
                return {
                  success: false,
                  error: 'Regex pattern not found in file content'
                }
              }
            } else {
              // Handle string replacement
              if (replaceAll) {
                let count = 0
                updatedContent = currentContent
                let index = updatedContent.indexOf(oldString)
                while (index !== -1) {
                  updatedContent = updatedContent.substring(0, index) + newString + updatedContent.substring(index + oldString.length)
                  count++
                  index = updatedContent.indexOf(oldString, index + newString.length)
                }
                replacementCount = count

                if (count === 0) {
                  return {
                    success: false,
                    error: 'Search text not found in file content'
                  }
                }
              } else {
                // Replace first occurrence only
                if (currentContent.includes(oldString)) {
                  const index = currentContent.indexOf(oldString)
                  updatedContent = currentContent.substring(0, index) + newString + currentContent.substring(index + oldString.length)
                  replacementCount = 1
                } else {
                  return {
                    success: false,
                    error: `Search string not found in file. Content length: ${currentContent.length} chars. Make sure the search string matches exactly including whitespace and indentation.`
                  }
                }
              }
            }

            // Check if content actually changed
            if (updatedContent === currentContent) {
              return {
                success: false,
                error: 'No changes were made - content is identical or search string not found'
              }
            }

            // Commit the changes
            const updateResponse = await octokit.rest.repos.createOrUpdateFileContents({
              owner,
              repo: repoName,
              path,
              message,
              content: Buffer.from(updatedContent).toString('base64'),
              sha: fileData.sha,
              branch,
              author: {
                name: process.env.PIPILOT_BOT_NAME || 'pipilot-swe-bot',
                email: userEmail || 'noreply@github.com'
              }
            })

            const result = {
              success: true,
              replacements_made: replacementCount,
              commit: {
                sha: updateResponse.data.commit.sha,
                message: updateResponse.data.commit.message,
                author: updateResponse.data.commit.author,
                url: updateResponse.data.commit.html_url
              },
              file: {
                path: updateResponse.data.content?.path,
                sha: updateResponse.data.content?.sha,
                previous_sha: fileData.sha
              },
              changes: {
                old_length: currentContent.length,
                new_length: updatedContent.length,
                diff_length: updatedContent.length - currentContent.length
              }
            }

            console.log(`[RepoAgent:${requestId.slice(0, 8)}] ✅ github_edit_file completed - File: ${path}, Replacements: ${replacementCount}, Commit: ${result.commit.sha?.slice(0, 8) || 'unknown'}`)
            return result
          } catch (error) {
            const errorMsg = `Failed to edit file: ${error instanceof Error ? error.message : 'Unknown error'}`
            console.error(`[RepoAgent:${requestId.slice(0, 8)}] ❌ github_edit_file failed:`, errorMsg)
            return {
              success: false,
              error: errorMsg
            }
          }
        }
      }),

      // --- Todo Management ---
      github_create_todo: tool({
        description: 'Create a new todo item to track progress on tasks',
        inputSchema: z.object({
          id: z.string().describe('Unique identifier for the todo item'),
          title: z.string().describe('Todo title/summary'),
          description: z.string().optional().describe('Optional detailed description'),
          status: z.enum(['pending', 'completed']).default('pending').describe('Initial status')
        }),
        execute: async ({ id, title, description, status = 'pending' }) => {
          const todo = {
            id,
            title,
            description,
            status
          }

          console.log(`[RepoAgent:${requestId.slice(0, 8)}] 📝 Created todo: ${title}`, todo)
          return { success: true, todo, message: `Created todo: "${title}"` }
        }
      }),

      github_update_todo: tool({
        description: 'Update an existing todo item (status, title, or description)',
        inputSchema: z.object({
          id: z.string().describe('Todo ID to update'),
          title: z.string().optional().describe('New title (if updating)'),
          description: z.string().optional().describe('New description (if updating)'),
          status: z.enum(['pending', 'completed']).optional().describe('New status (if updating)')
        }),
        execute: async ({ id, title, description, status }) => {
          console.log(`[RepoAgent:${requestId.slice(0, 8)}] 📝 Updated todo ${id}:`, { title, description, status })
          const result = {
            success: true,
            todo: {
              id,
              title,
              description,
              status
            }
          }
          console.log(`[RepoAgent:${requestId.slice(0, 8)}] 📝 Update result:`, result)
          return result
        }
      }),

      github_delete_todo: tool({
        description: 'Delete a todo item',
        inputSchema: z.object({
          id: z.string().describe('Todo ID to delete')
        }),
        execute: async ({ id }) => {
          console.log(`[RepoAgent:${requestId.slice(0, 8)}] 🗑️ Deleted todo: ${id}`)
          return { success: true, deleted_id: id }
        }
      }),

      // --- Error Checking Tool ---
      check_dev_errors: tool({
        description: 'Run build process for JavaScript/TypeScript projects or syntax check for Python projects. Monitors console logs to detect any errors and reports success/failure status.',
        inputSchema: z.object({
          repo: z.string().describe('Repository in format "owner/repo"'),
          mode: z.enum(['build', 'python']).describe('Error check mode: "build" for JavaScript/TypeScript projects, "python" for Python projects'),
          timeoutSeconds: z.number().optional().describe('How long to wait for the error check (default: 30 seconds)')
        }),
        execute: async ({ repo, mode, timeoutSeconds = 30 }) => {
          const toolStartTime = Date.now()
          const logs: string[] = []
          const errors: string[] = []

          try {
            console.log(`[RepoAgent:${requestId.slice(0, 8)}] 🔍 Starting error check in ${mode} mode for repo: ${repo}`)

            // Parse repo string
            const { owner, repo: repoName } = parseRepoString(repo)
            const e2bApiKey = process.env.E2B_API_KEY
            if (!e2bApiKey) {
              const executionTime = Date.now() - toolStartTime
              return {
                success: false,
                error: 'E2B API key not configured',
                mode,
                logs,
                errors: ['E2B_API_KEY environment variable not set'],
                executionTimeMs: executionTime
              }
            }

            // Create repo key for session storage
            const repoKey = `${owner}/${repoName}`

            // Check if we already have this repo in session storage
            let sessionData = repoSessionStorage.get(repoKey)
            if (!sessionData) {
              // Import the repository and store in session memory
              console.log(`[RepoAgent:${requestId.slice(0, 8)}] 📦 Importing repository for error checking: https://github.com/${repoKey}`)
              const repoUrl = `https://github.com/${repoKey}`
              await importGithubRepoForSession(repoUrl, repoKey, octokit, 'HEAD')
              sessionData = repoSessionStorage.get(repoKey)
            }

            if (!sessionData) {
              const executionTime = Date.now() - toolStartTime
              return {
                success: false,
                error: 'Failed to load repository files into session',
                mode,
                logs,
                errors: ['Could not import repository files'],
                executionTimeMs: executionTime
              }
            }

            const { files: sessionFiles } = sessionData
            const allFiles = Array.from(sessionFiles.values())

            if (!allFiles || allFiles.length === 0) {
              const executionTime = Date.now() - toolStartTime
              return {
                success: false,
                error: 'No files found in repository',
                mode,
                logs,
                errors: ['Repository appears to be empty'],
                executionTimeMs: executionTime
              }
            }

            console.log(`[RepoAgent:${requestId.slice(0, 8)}] 📁 Loaded ${allFiles.length} files from session storage`)

            // Import E2B functions
            const {
              createEnhancedSandbox,
              SandboxError
            } = await import('@/lib/e2b-enhanced')

            let serverStarted = false
            let buildCompleted = false

            // Detect project type from session files
            const hasPackageJson = allFiles.some((f: any) => f.path === 'package.json')
            const hasPythonFiles = allFiles.some((f: any) =>
              f.path === 'setup.py' || f.path === 'requirements.txt' || f.path === 'pyproject.toml'
            )

            logs.push(`Detected: ${hasPythonFiles ? 'Python' : hasPackageJson ? 'Node.js/TypeScript' : 'Unknown'} project`)

            // Create sandbox
            const sandbox = await createEnhancedSandbox({
              template: 'pipilot-expo',
              timeoutMs: (timeoutSeconds || 30) * 1000 + 30000,
              env: {}
            })

            logs.push('Sandbox created successfully')

            // Prepare files for sandbox - use all files from session storage
            const sandboxFiles: any[] = allFiles
              .filter(file => file.content && typeof file.content === 'string')
              .map(file => ({
                path: `/project/${file.path}`,
                content: file.content
              }))

            // Write files to sandbox
            await sandbox.writeFiles(sandboxFiles)
            logs.push(`Written ${sandboxFiles.length} files to sandbox`)

            if (mode === 'build') {
              // For build mode - run build process for JavaScript/TypeScript projects
              if (!hasPackageJson) {
                return {
                  success: false,
                  error: 'package.json not found. This doesn\'t appear to be a Node.js/JavaScript project.',
                  mode,
                  logs,
                  errors: ['No package.json found'],
                  executionTimeMs: Date.now() - toolStartTime
                }
              }

              logs.push('Installing dependencies...')
              const installResult = await sandbox.installDependenciesRobust('/project', {
                timeoutMs: 120000,
                envVars: {},
                packageManager: 'pnpm',
                onStdout: (data: string) => logs.push(`[INSTALL] ${data.trim()}`),
                onStderr: (data: string) => {
                  const msg = data.trim()
                  logs.push(`[INSTALL] ${msg}`)
                  if (msg.includes('error') || msg.includes('failed')) {
                    errors.push(`[INSTALL ERROR] ${msg}`)
                  }
                }
              })

              if (installResult.exitCode !== 0) {
                return {
                  success: false,
                  error: 'Dependency installation failed',
                  mode,
                  logs,
                  errors,
                  exitCode: installResult.exitCode,
                  executionTimeMs: Date.now() - toolStartTime
                }
              }

              logs.push('Dependencies installed successfully')

              // Run build command
              logs.push('Running: npm run build')
              const buildResult = await sandbox.executeCommand('npm run build', {
                workingDirectory: '/project',
                timeoutMs: (timeoutSeconds || 30) * 1000,
                envVars: {},
                onStdout: (data: string) => logs.push(`[BUILD] ${data.trim()}`),
                onStderr: (data: string) => {
                  const msg = data.trim()
                  errors.push(`[BUILD ERROR] ${msg}`)
                  logs.push(`[BUILD ERROR] ${msg}`)
                }
              })

              // Filter out non-error messages
              const buildErrors = errors.filter(e =>
                !e.includes('warning') &&
                !e.includes('Warning') &&
                !e.includes('⚠') &&
                !e.includes('deprecated')
              )

              return {
                success: buildResult.exitCode === 0 && buildErrors.length === 0,
                message: buildResult.exitCode === 0
                  ? 'Build completed successfully'
                  : `Build failed with exit code ${buildResult.exitCode}`,
                mode,
                logs,
                errors: buildErrors,
                errorCount: buildErrors.length,
                exitCode: buildResult.exitCode,
                executionTimeMs: Date.now() - toolStartTime
              }

            } else if (mode === 'python') {
              // For Python projects - run compileall syntax check
              if (!hasPythonFiles) {
                return {
                  success: false,
                  error: 'No Python files found. This doesn\'t appear to be a Python project.',
                  mode,
                  logs,
                  errors: ['No Python files found'],
                  executionTimeMs: Date.now() - toolStartTime
                }
              }

              // Run Python compile check
              logs.push('Executing: python3 -m compileall . -q -x ".*/(venv|\\.venv).*"')
              const pythonResult = await sandbox.executeCommand(
                'cd /project && python3 -m compileall . -q -x ".*/(venv|\\.venv).*"',
                {
                  workingDirectory: '/project',
                  timeoutMs: (timeoutSeconds || 30) * 1000,
                  envVars: {},
                  onStdout: (data: string) => {
                    const msg = data.trim()
                    if (msg) logs.push(`[PYTHON] ${msg}`)
                  },
                  onStderr: (data: string) => {
                    const msg = data.trim()
                    if (msg) {
                      errors.push(`[PYTHON ERROR] ${msg}`)
                      logs.push(`[PYTHON ERROR] ${msg}`)
                    }
                  }
                }
              )

              return {
                success: pythonResult.exitCode === 0 && errors.length === 0,
                message: pythonResult.exitCode === 0
                  ? 'Python syntax check passed'
                  : `Python syntax check failed with exit code ${pythonResult.exitCode}`,
                mode,
                logs,
                errors,
                errorCount: errors.length,
                exitCode: pythonResult.exitCode,
                executionTimeMs: Date.now() - toolStartTime
              }
            }
          } catch (error: any) {
            console.error(`[RepoAgent:${requestId.slice(0, 8)}] ❌ Error check failed:`, error)
            return {
              success: false,
              error: error?.message || 'Error check failed',
              mode,
              logs,
              errors: [error?.message || 'Unknown error occurred during error check'],
              executionTimeMs: Date.now() - toolStartTime
            }
          }
        }
      }),

      // GitHub Actions Workflow Management
      github_list_workflows: tool({
        description: 'List all GitHub Actions workflows in the repository',
        inputSchema: z.object({
          repo: z.string().describe('Repository in format "owner/repo"')
        }),
        execute: async ({ repo }) => {
          try {
            const { owner, repo: repoName } = parseRepoString(repo)
            const response = await octokit.rest.actions.listRepoWorkflows({
              owner,
              repo: repoName
            })

            return {
              success: true,
              total_count: response.data.total_count,
              workflows: response.data.workflows.map(workflow => ({
                id: workflow.id,
                node_id: workflow.node_id,
                name: workflow.name,
                path: workflow.path,
                state: workflow.state,
                created_at: workflow.created_at,
                updated_at: workflow.updated_at,
                url: workflow.url,
                html_url: workflow.html_url
              }))
            }
          } catch (error) {
            return {
              success: false,
              error: `Failed to list workflows: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
          }
        }
      }),

      github_trigger_workflow: tool({
        description: 'Trigger a GitHub Actions workflow run manually',
        inputSchema: z.object({
          repo: z.string().describe('Repository in format "owner/repo"'),
          workflow: z.string().describe('Workflow ID or filename (e.g., "ci.yml")'),
          ref: z.string().describe('The ref (branch, tag, or commit SHA) to run the workflow on'),
          inputs: z.record(z.string()).optional().describe('Optional input parameters for the workflow')
        }),
        execute: async ({ repo, workflow, ref, inputs }) => {
          try {
            const { owner, repo: repoName } = parseRepoString(repo)
            const response = await octokit.rest.actions.createWorkflowDispatch({
              owner,
              repo: repoName,
              workflow_id: workflow,
              ref,
              inputs: inputs || {}
            })

            return {
              success: true,
              message: `Workflow "${workflow}" triggered on ${ref}`,
              workflow,
              ref,
              status: 'dispatched'
            }
          } catch (error) {
            return {
              success: false,
              error: `Failed to trigger workflow: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
          }
        }
      }),

      github_list_workflow_runs: tool({
        description: 'List runs for a specific workflow',
        inputSchema: z.object({
          repo: z.string().describe('Repository in format "owner/repo"'),
          workflow: z.string().describe('Workflow ID or filename (e.g., "ci.yml")'),
          status: z.enum(['completed', 'action_required', 'cancelled', 'failure', 'neutral', 'skipped', 'stale', 'success', 'timed_out', 'in_progress', 'queued', 'requested', 'waiting']).optional().describe('Filter by run status'),
          per_page: z.number().min(1).max(100).optional().describe('Results per page (default: 30)')
        }),
        execute: async ({ repo, workflow, status, per_page = 30 }) => {
          try {
            const { owner, repo: repoName } = parseRepoString(repo)
            const response = await octokit.rest.actions.listWorkflowRuns({
              owner,
              repo: repoName,
              workflow_id: workflow,
              status: status as any,
              per_page
            })

            return {
              success: true,
              total_count: response.data.total_count,
              workflow_runs: response.data.workflow_runs.map(run => ({
                id: run.id,
                name: run.name,
                node_id: run.node_id,
                head_branch: run.head_branch,
                head_sha: run.head_sha,
                path: run.path,
                display_title: run.display_title,
                run_number: run.run_number,
                event: run.event,
                status: run.status,
                conclusion: run.conclusion,
                workflow_id: run.workflow_id,
                check_suite_id: run.check_suite_id,
                url: run.url,
                html_url: run.html_url,
                pull_requests: run.pull_requests,
                created_at: run.created_at,
                updated_at: run.updated_at,
                actor: {
                  login: run.actor?.login,
                  id: run.actor?.id,
                  avatar_url: run.actor?.avatar_url
                },
                run_attempt: run.run_attempt,
                referenced_workflows: run.referenced_workflows
              }))
            }
          } catch (error) {
            return {
              success: false,
              error: `Failed to list workflow runs: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
          }
        }
      }),

      github_get_workflow_run: tool({
        description: 'Get detailed information about a specific workflow run including status, conclusion, timing, and logs',
        inputSchema: z.object({
          repo: z.string().describe('Repository in format "owner/repo"'),
          run_id: z.number().describe('The workflow run ID')
        }),
        execute: async ({ repo, run_id }) => {
          try {
            const { owner, repo: repoName } = parseRepoString(repo)
            const response = await octokit.rest.actions.getWorkflowRun({
              owner,
              repo: repoName,
              run_id
            })

            return {
              success: true,
              run: {
                id: response.data.id,
                name: response.data.name,
                node_id: response.data.node_id,
                head_branch: response.data.head_branch,
                head_sha: response.data.head_sha,
                path: response.data.path,
                run_number: response.data.run_number,
                event: response.data.event,
                display_title: response.data.display_title,
                status: response.data.status,
                conclusion: response.data.conclusion,
                workflow_id: response.data.workflow_id,
                check_suite_id: response.data.check_suite_id,
                url: response.data.url,
                html_url: response.data.html_url,
                pull_requests: response.data.pull_requests,
                created_at: response.data.created_at,
                updated_at: response.data.updated_at,
                actor: {
                  login: response.data.actor?.login,
                  id: response.data.actor?.id
                },
                run_attempt: response.data.run_attempt,
                referenced_workflows: response.data.referenced_workflows,
                jobs_url: response.data.jobs_url,
                logs_url: response.data.logs_url,
                cancel_url: response.data.cancel_url,
                rerun_url: response.data.rerun_url,
                previous_attempt_url: response.data.previous_attempt_url,
                workflow_url: response.data.workflow_url,
                head_commit: response.data.head_commit ? {
                  id: response.data.head_commit.id,
                  tree_id: response.data.head_commit.tree_id,
                  message: response.data.head_commit.message,
                  timestamp: response.data.head_commit.timestamp,
                  author: response.data.head_commit.author,
                  committer: response.data.head_commit.committer
                } : null
              }
            }
          } catch (error) {
            return {
              success: false,
              error: `Failed to get workflow run: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
          }
        }
      }),

      github_get_workflow_run_logs: tool({
        description: 'Get readable logs from a workflow run by retrieving individual job logs',
        inputSchema: z.object({
          repo: z.string().describe('Repository in format "owner/repo"'),
          run_id: z.number().describe('The workflow run ID')
        }),
        execute: async ({ repo, run_id }) => {
          try {
            const { owner, repo: repoName } = parseRepoString(repo)

            // Get workflow run details
            const runResponse = await octokit.rest.actions.getWorkflowRun({
              owner,
              repo: repoName,
              run_id
            })

            // Get jobs for this run
            const jobsResponse = await octokit.rest.actions.listJobsForWorkflowRun({
              owner,
              repo: repoName,
              run_id,
              per_page: 100
            })

            // Get logs for each job
            const jobLogs = []
            for (const job of jobsResponse.data.jobs) {
              try {
                const jobLogsResponse = await octokit.rest.actions.downloadJobLogsForWorkflowRun({
                  owner,
                  repo: repoName,
                  job_id: job.id
                })

                // Extract logs from zip
                const zip = new JSZip()
                await zip.loadAsync(jobLogsResponse.data as any)
                
                let logsText = ''
                for (const [fileName, file] of Object.entries(zip.files)) {
                  if (!file.dir) {
                    const content = await file.async('text')
                    logsText += `=== ${fileName} ===\n${content}\n\n`
                  }
                }

                jobLogs.push({
                  job_id: job.id,
                  job_name: job.name,
                  status: job.status,
                  conclusion: job.conclusion,
                  started_at: job.started_at,
                  completed_at: job.completed_at,
                  logs: logsText,
                  logs_length: logsText.length
                })
              } catch (jobError) {
                jobLogs.push({
                  job_id: job.id,
                  job_name: job.name,
                  status: job.status,
                  conclusion: job.conclusion,
                  error: `Failed to get logs: ${jobError instanceof Error ? jobError.message : 'Unknown error'}`
                })
              }
            }

            return {
              success: true,
              run_id,
              run_name: runResponse.data.name,
              status: runResponse.data.status,
              conclusion: runResponse.data.conclusion,
              created_at: runResponse.data.created_at,
              updated_at: runResponse.data.updated_at,
              html_url: runResponse.data.html_url,
              jobs_count: jobsResponse.data.total_count,
              jobs: jobLogs
            }
          } catch (error) {
            return {
              success: false,
              error: `Failed to get workflow logs: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
          }
        }
      }),

      github_cancel_workflow_run: tool({
        description: 'Cancel a running workflow',
        inputSchema: z.object({
          repo: z.string().describe('Repository in format "owner/repo"'),
          run_id: z.number().describe('The workflow run ID to cancel')
        }),
        execute: async ({ repo, run_id }) => {
          try {
            const { owner, repo: repoName } = parseRepoString(repo)
            await octokit.rest.actions.cancelWorkflowRun({
              owner,
              repo: repoName,
              run_id
            })

            return {
              success: true,
              message: `Workflow run ${run_id} has been cancelled`,
              run_id
            }
          } catch (error) {
            return {
              success: false,
              error: `Failed to cancel workflow run: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
          }
        }
      }),

      github_rerun_workflow: tool({
        description: 'Rerun a failed or previous workflow run',
        inputSchema: z.object({
          repo: z.string().describe('Repository in format "owner/repo"'),
          run_id: z.number().describe('The workflow run ID to rerun')
        }),
        execute: async ({ repo, run_id }) => {
          try {
            const { owner, repo: repoName } = parseRepoString(repo)
            const response = await octokit.rest.actions.reRunWorkflow({
              owner,
              repo: repoName,
              run_id
            })

            return {
              success: true,
              message: `Workflow run ${run_id} has been rerun`,
              new_run_id: response.data.id,
              status: response.data.status,
              html_url: response.data.html_url
            }
          } catch (error) {
            return {
              success: false,
              error: `Failed to rerun workflow: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
          }
        }
      }),

      web_search: tool({
        description: 'Search the web for current information and context. Returns clean, structured text instead of raw JSON data.',
        inputSchema: z.object({
          query: z.string().describe('Search query to find relevant web content')
        }),
        execute: async ({ query }) => {
          try {
            // Add strict 20-second timeout to prevent hanging
            const searchResults = await withTimeout(
              searchWeb(query),
              20000, // Reduced from 30000 (30s) to 20000 (20s) - stricter timeout
              'Web search'
            )

            // More generous truncation for 256k context models (50k total limit)
            const MAX_SEARCH_CHARS = 50000;
            let cleanResults = searchResults.cleanedResults;
            let wasTruncated = false;

            if (cleanResults.length > MAX_SEARCH_CHARS) {
              cleanResults = cleanResults.substring(0, MAX_SEARCH_CHARS);
              wasTruncated = true;
            }

            return {
              success: true,
              message: `Web search completed successfully for query: "${query}"${wasTruncated ? ` (truncated to ${MAX_SEARCH_CHARS} chars)` : ''}`,
              // Send clean, structured text instead of raw JSON
              cleanResults,
              // Keep minimal metadata for reference
              metadata: {
                query: searchResults.query,
                resultCount: searchResults.resultCount,
                originalLength: searchResults.cleanedResults.length,
                finalLength: cleanResults.length,
                wasTruncated,
                maxChars: MAX_SEARCH_CHARS
              },
              query
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            console.error('[ERROR] web_search failed:', error)

            return {
              success: false,
              error: `Web search failed: ${errorMessage}`,
              query
            }
          }
        }
      }),

      web_extract: tool({
        description: 'Extract content from web pages using AnyAPI. Returns clean, structured text.',
        inputSchema: z.object({
          urls: z.union([
            z.string().url().describe('URL to extract content from'),
            z.array(z.string().url()).describe('Array of URLs to extract content from')
          ]).describe('URL or URLs to extract content from')
        }),
        execute: async ({ urls }) => {
          // Ensure urls is always an array
          const urlArray = Array.isArray(urls) ? urls : [urls];

          try {
            // Import the web scraper
            const { webScraper } = await import('@/lib/web-scraper');

            // Process URLs sequentially to manage API key usage, but with strict 30s total timeout
            const extractPromise = Promise.all(
              urlArray.map(async (url) => {
                try {
                  const scraperResult = await webScraper.execute({ url });

                  // Debug logging for web extraction
                  console.log(`[DEBUG] Web extract for ${url}:`, {
                    hasResult: !!scraperResult,
                    resultType: typeof scraperResult,
                    resultKeys: scraperResult ? Object.keys(scraperResult) : [],
                    hasCleanResults: scraperResult?.cleanResults ? true : false,
                    cleanResultsType: typeof scraperResult?.cleanResults,
                    cleanResultsLength: scraperResult?.cleanResults?.length || 0
                  });

                  // Extract content from the scraper result
                  const extractContent = (result: any): string => {
                    // The webScraper returns cleanResults directly
                    if (result && typeof result === 'object' && result.cleanResults) {
                      return result.cleanResults;
                    }

                    // Fallback to message if cleanResults not available
                    if (result && typeof result === 'object' && result.message) {
                      return result.message;
                    }

                    // Last resort: stringify the result (but avoid circular references)
                    try {
                      return JSON.stringify(result, (key, value) => {
                        if (key === 'metadata' || key === 'apiKeyUsed') {
                          return '[REDACTED]';
                        }
                        return value;
                      }, 2);
                    } catch {
                      return 'Content extracted successfully';
                    }
                  };

                  return {
                    success: true,
                    url,
                    cleanResults: extractContent(scraperResult),
                    metadata: {
                      url,
                      timestamp: new Date().toISOString(),
                      apiKeyUsed: scraperResult.metadata?.apiKeyUsed || 'unknown'
                    }
                  };
                } catch (error) {
                  console.error(`[ERROR] Web extract failed for ${url}:`, error);
                  return {
                    success: false,
                    url,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    cleanResults: ''
                  };
                }
              })
            );

            // Add strict 30-second timeout but return partial results if available
            let extractionResults: any[];
            try {
              extractionResults = await withTimeout(
                extractPromise,
                30000, // Reduced from 45000 (45s) to 30000 (30s) - stricter timeout
                'Web content extraction'
              );
            } catch (timeoutError) {
              // If we timeout, try to get partial results from any completed extractions
              console.warn('[WEB_EXTRACT] Timeout occurred, attempting to return partial results');
              try {
                // Race the original promise against a very short timeout to get any completed results
                extractionResults = await Promise.race([
                  extractPromise,
                  new Promise<any[]>((_, reject) => setTimeout(() => reject(new Error('Partial timeout')), 1000))
                ]);
              } catch (partialError) {
                // If even partial results aren't available quickly, return empty results
                extractionResults = urlArray.map(url => ({
                  success: false,
                  url,
                  error: 'Extraction timed out - no partial results available',
                  cleanResults: ''
                }));
              }
            }

            // Separate successful and failed extractions
            const successfulResults = extractionResults.filter(result => result.success);
            const failedResults = extractionResults.filter(result => !result.success);

            // More generous truncation for 256k context models (15k per URL, 75k total)
            const MAX_CHARS_PER_URL = 15000;
            const MAX_TOTAL_CHARS = 75000;

            let totalCharsUsed = 0;
            const truncatedResults = successfulResults.map(result => {
              const originalLength = result.cleanResults.length;
              let truncatedContent = result.cleanResults;
              let wasTruncated = false;
              let truncationReason = '';

              // Check per-URL limit
              if (originalLength > MAX_CHARS_PER_URL) {
                truncatedContent = result.cleanResults.substring(0, MAX_CHARS_PER_URL);
                wasTruncated = true;
                truncationReason = `per-URL limit (${MAX_CHARS_PER_URL} chars)`;
              }

              // Check total limit (but don't truncate if we're the first result)
              if (totalCharsUsed + truncatedContent.length > MAX_TOTAL_CHARS && successfulResults.indexOf(result) > 0) {
                const remainingChars = MAX_TOTAL_CHARS - totalCharsUsed;
                if (remainingChars > 1000) { // Only include if we can fit meaningful content
                  truncatedContent = truncatedContent.substring(0, remainingChars);
                  wasTruncated = true;
                  truncationReason = `total limit (${MAX_TOTAL_CHARS} chars)`;
                } else {
                  truncatedContent = ''; // Skip this result entirely
                  wasTruncated = true;
                  truncationReason = 'total limit exceeded';
                }
              }

              totalCharsUsed += truncatedContent.length;

              return {
                ...result,
                cleanResults: truncatedContent,
                wasTruncated,
                originalLength,
                truncationReason: wasTruncated ? truncationReason : undefined
              };
            });

            // Debug logging for final result
            console.log('[DEBUG] Web extract final result:', {
              totalUrls: urlArray.length,
              successfulCount: successfulResults.length,
              failedCount: failedResults.length,
              totalCharsUsed,
              maxTotalChars: MAX_TOTAL_CHARS,
              maxPerUrlChars: MAX_CHARS_PER_URL,
              cleanResultsLength: truncatedResults.map(r => r.cleanResults?.length || 0),
              truncatedCount: truncatedResults.filter(r => r.wasTruncated).length,
              sampleCleanResults: truncatedResults[0]?.cleanResults?.substring(0, 200) || 'none'
            });

            return {
              success: successfulResults.length > 0,
              message: successfulResults.length > 0
                ? `Successfully extracted content from ${successfulResults.length} URL(s)${truncatedResults.some(r => r.wasTruncated) ? ` (truncated to fit ${MAX_TOTAL_CHARS} char limit)` : ''}`
                : 'Failed to extract content from any URLs',
              cleanResults: truncatedResults.map(result => result.cleanResults).join('\n\n'),
              metadata: {
                successCount: successfulResults.length,
                failedCount: failedResults.length,
                urls: urlArray,
                totalCharsUsed,
                maxTotalChars: MAX_TOTAL_CHARS,
                maxPerUrlChars: MAX_CHARS_PER_URL,
                truncationInfo: truncatedResults.map(r => ({
                  url: r.url,
                  originalLength: r.originalLength,
                  finalLength: r.cleanResults.length,
                  wasTruncated: r.wasTruncated,
                  truncationReason: r.truncationReason
                }))
              }
            };
          } catch (error) {
            console.error('[ERROR] Web extract failed:', error);

            return {
              success: false,
              error: `Web extract failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              cleanResults: '',
              metadata: {
                urls: urlArray
              }
            };
          }
        }
      })
    }

    // Stream the response
    // Limit to last 6 messages for performance, similar to chat-v2 route
    const recentMessages = Array.isArray(messages) ? messages.slice(-6) : []
    console.log(`[RepoAgent:${requestId.slice(0, 8)}] 🤖 Starting streamText with ${recentMessages.length} messages (limited from ${messages.length} total)`)
    const result = await streamText({
      model,
      system: systemPrompt,
      messages: recentMessages,
      tools,
      stopWhen: stepCountIs(60),
      onFinish: async (result) => {
        const responseTime = Date.now() - startTime
        console.log(`[RepoAgent:${requestId.slice(0, 8)}] ✅ Stream finished in ${responseTime}ms - Total tokens: ${result.usage.totalTokens}`)

        // ============================================================================
        // ABE BILLING - Deduct credits for successful request
        // ============================================================================
        if (authContext) {
          const billingResult = await processRequestBilling({
            userId: authContext.userId,
            model: modelId || DEFAULT_CHAT_MODEL,
            requestType: 'repo-agent',
            endpoint: '/api/repo-agent',
            responseTimeMs: responseTime,
            status: 'success'
          })

          if (billingResult.success) {
            console.log(
              `[RepoAgent:${requestId.slice(0, 8)}] 💰 Deducted ${billingResult.creditsUsed} credits. New balance: ${billingResult.newBalance} credits (${Math.floor((billingResult.newBalance || 0) / CREDITS_PER_MESSAGE)} messages remaining)`
            )
          } else {
            console.error(`[RepoAgent:${requestId.slice(0, 8)}] ⚠️ Failed to deduct credits:`, billingResult.error)
          }
        }
      }
    })

    // Stream the response using newline-delimited JSON format (matching chat-v2 pattern)
    return new Response(
      new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder()

          try {
            // Stream the text and tool calls
            for await (const part of result.fullStream) {
              // Log tool calls and deltas
              if (part.type === 'tool-call') {
                console.log(`[RepoAgent:${requestId.slice(0, 8)}] 🔨 Tool call initiated:`, {
                  toolName: (part as any).toolName,
                  toolCallId: (part as any).toolCallId
                })
              } else if (part.type === 'tool-result') {
                console.log(`[RepoAgent:${requestId.slice(0, 8)}] 🎯 Tool result received:`, {
                  toolName: (part as any).toolName,
                  toolCallId: (part as any).toolCallId,
                  resultPreview: JSON.stringify((part as any).result)?.substring(0, 100) || 'N/A'
                })
              } else if (part.type === 'text-delta') {
                // Text deltas are frequent, just count them silently
              }
              // Send each part as newline-delimited JSON (no SSE "data:" prefix)
              controller.enqueue(encoder.encode(JSON.stringify(part) + '\n'))
            }
          } catch (error) {
            console.error(`[RepoAgent:${requestId.slice(0, 8)}] ❌ Stream error:`, error)
          } finally {
            controller.close()
          }
        }
      }),
      {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      }
    )

  } catch (error: any) {
    const responseTime = Date.now() - startTime
    console.error(`[RepoAgent:${requestId.slice(0, 8)}] ❌ Error in POST handler (${responseTime}ms):`, {
      message: error?.message,
      code: error?.code,
      status: error?.status,
      repo: currentRepo,
      branch: currentBranch
    })

    // ============================================================================
    // ABE BILLING - Log failed request (no charge)
    // ============================================================================
    if (authContext) {
      await processRequestBilling({
        userId: authContext.userId,
        model: modelId || DEFAULT_CHAT_MODEL,
        requestType: 'repo-agent',
        endpoint: '/api/repo-agent',
        responseTimeMs: responseTime,
        status: 'error',
        errorMessage: error.message
      })
      console.log(`[RepoAgent] ⚠️ Error logged (no credits charged)`)
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
