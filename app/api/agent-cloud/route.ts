/**
 * Agent Cloud API
 *
 * API endpoint for running Claude Code in E2B sandboxes.
 * Configured with Bonsai AI Gateway (go.trybons.ai) for AI routing.
 *
 * Features:
 * - Sandbox reuse with Sandbox.connect() for persistent sessions
 * - Conversation memory persistence across messages
 * - Real-time streaming with Server-Sent Events
 * - GitHub repo cloning and git operations
 * - Internet access enabled for sandboxes
 * - MCP support (Tavily for web search, GitHub for repo operations)
 * - Public repo cloning (no token required)
 *
 * POST /api/agent-cloud
 * - action: 'create' - Create or connect to existing sandbox
 * - action: 'run' - Run a Claude Code prompt (with memory)
 * - action: 'playwright' - Run a Playwright script
 * - action: 'commit' - Commit changes in the sandbox
 * - action: 'push' - Push changes to remote
 * - action: 'diff' - Get git diff stats
 * - action: 'terminate' - Terminate a sandbox
 * - action: 'status' - Get sandbox status
 * - action: 'list' - List all sandboxes for user
 *
 * Environment Variables Required:
 * - BONSAI_API_KEY: Your Bonsai API key (go.trybons.ai)
 * - E2B_API_KEY: Your E2B API key (for sandbox creation)
 */

import { NextRequest, NextResponse } from 'next/server'
import { Sandbox } from 'e2b'
import { createClient } from '@/lib/supabase/server'
import { getNextBonsaiKey } from '@/lib/ai-providers'
// getDeploymentTokens uses browser client - query user_settings directly with server client instead

// Bonsai AI Gateway configuration (testing Bonsai as general API proxy)
// Bonsai exposes an Anthropic-compatible API at https://go.trybons.ai
// Claude Code reads ANTHROPIC_BASE_URL to know where to send requests
const AI_GATEWAY_BASE_URL = 'https://go.trybons.ai'

// Available models through Bonsai AI Gateway
// These model IDs are what Bonsai expects (provider/model format)
const AVAILABLE_MODELS = {
  sonnet: 'anthropic/claude-sonnet-4.5',   // Default - fast code generation
  opus: 'anthropic/claude-opus-4',         // High quality
  haiku: 'openai/gpt-5.1-codex',          // OpenAI Codex via Bonsai
  flash: 'z-ai/glm-4.6',                  // Fast inference via Bonsai
} as const

// Strip Bonsai routing metadata from model responses.
// Bonsai injects lines like: "@bonsai: routing to driven-jay (stealth, free premium model)..."
// Because text arrives in small streaming chunks, we use a stateful filter that buffers
// the start of each response turn until we can determine if it contains a @bonsai: line.
const BONSAI_ROUTING_PATTERN = /^@bonsai:[^\n]*\n?/gm

function stripBonsaiMeta(text: string): string {
  return text.replace(BONSAI_ROUTING_PATTERN, '')
}

/** Stateful filter for a single response turn. Buffers initial chunks until
 *  we can confirm/deny a @bonsai: prefix, then flushes and passes through. */
function createBonsaiFilter() {
  let buffer = ''
  let stripping = false  // true while inside a @bonsai: line
  let passthrough = false // true once we've confirmed no more @bonsai: prefixes

  return function filter(chunk: string): string {
    if (passthrough) {
      // Fast path: already past any potential Bonsai prefix
      return stripBonsaiMeta(chunk)
    }

    buffer += chunk

    // If buffer starts with @bonsai: we need to strip until newline
    if (buffer.startsWith('@bonsai:') || stripping) {
      stripping = true
      const nlIndex = buffer.indexOf('\n')
      if (nlIndex === -1) {
        // Haven't seen end of @bonsai: line yet, keep buffering
        return ''
      }
      // Found newline - strip the @bonsai: line and check remainder
      buffer = buffer.slice(nlIndex + 1)
      stripping = false
      // Check if there's another @bonsai: line (unlikely but handle it)
      if (buffer.startsWith('@bonsai:')) {
        return filter('') // recurse to strip next line
      }
      // Done stripping, flush remainder
      passthrough = true
      const result = buffer
      buffer = ''
      return stripBonsaiMeta(result)
    }

    // Buffer doesn't start with @bonsai: - could be partial "@bon" etc.
    // If we have enough chars to rule out @bonsai: prefix, flush
    if (buffer.length >= 8 && !buffer.startsWith('@bonsai:')) {
      passthrough = true
      const result = buffer
      buffer = ''
      return result
    }

    // Still ambiguous (< 8 chars that could still become @bonsai:)
    // Check if what we have so far is still a valid prefix of "@bonsai:"
    const prefix = '@bonsai:'
    if (prefix.startsWith(buffer)) {
      return '' // keep buffering
    }

    // Buffer diverged from "@bonsai:" - not a match, flush everything
    passthrough = true
    const result = buffer
    buffer = ''
    return result
  }
}

// Store active sandboxes with user association
// Key: `${userId}-${repoFullName}` or `${userId}-default`
const activeSandboxes = new Map<string, {
  sandboxId: string
  sandbox: Sandbox
  createdAt: Date
  lastActivity: Date
  model?: string
  userId: string
  repo?: {
    full_name: string
    branch: string
    cloned: boolean
  }
  workingBranch?: string // The branch created for this session (e.g., pipilot/fix-login-bug-a1b2)
  workDir?: string // Actual working directory (e.g., /home/user/repo-name/)
  // MCP gateway URL (Tavily HTTP MCP)
  mcpGatewayUrl?: string
  // Conversation history for memory persistence
  conversationHistory: Array<{
    role: 'user' | 'assistant'
    content: string
    timestamp: Date
  }>
}>()

// Cleanup inactive sandboxes after 30 minutes (increased from 10)
const SANDBOX_TIMEOUT = 30 * 60 * 1000

// System directory - for Claude SDK, scripts, temp files (NOT committed to git)
const SYSTEM_DIR = '/home/user'

// Project base directory - repos/projects go here as subfolders
const PROJECT_BASE_DIR = '/home/user/project'

// Conversation history file path in sandbox
const HISTORY_FILE = '/home/user/.claude_history.json'

// Default .gitignore template to prevent committing common artifacts
const DEFAULT_GITIGNORE = `# Dependencies
node_modules/
.pnpm-store/

# Build outputs
dist/
build/
.next/
out/

# Environment files
.env
.env.local
.env.*.local

# IDE and editor files
.idea/
.vscode/
*.swp
*.swo
*~

# OS files
.DS_Store
Thumbs.db

# Debug logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# Testing
coverage/
.nyc_output/

# Temporary files
*.tmp
*.temp
.cache/
`

/**
 * Generate a branch name from the first 4 words of a prompt
 * Example: "fix the login bug in auth" -> "pipilot/fix-the-login-a1b2"
 */
function generateBranchName(prompt: string): string {
  // Get first 4 words, lowercase, replace non-alphanumeric with dashes
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 0)
    .slice(0, 4)
    .join('-')

  // Add random suffix to avoid conflicts
  const suffix = Math.random().toString(36).substring(2, 6)

  return `pipilot/${words || 'task'}-${suffix}`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, sandboxId, prompt, script, config, message } = body

    switch (action) {
      case 'create':
        return handleCreate(request, config)

      case 'run':
        return handleRun(sandboxId, prompt, body.options)

      case 'playwright':
        return handlePlaywright(sandboxId, script)

      case 'commit':
        return handleCommit(sandboxId, message)

      case 'push':
        return handlePush(request, sandboxId)

      case 'diff':
        return handleDiff(sandboxId)

      case 'terminate':
        return handleTerminate(sandboxId)

      case 'status':
        return handleStatus(sandboxId)

      case 'list':
        return handleList(request)

      case 'restore':
        return handleRestore(body.sandboxId, body.conversationHistory)

      case 'stream':
        return handleStreamPost(request, body.sandboxId, body.prompt || '', body.images || [])

      case 'start-stream-server':
        return handleStartStreamServer(request, body.sandboxId)

      case 'direct-stream':
        return handleDirectStream(body.sandboxId, body.prompt || '', body.images || [])

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: create, run, playwright, commit, push, diff, terminate, status, list, start-stream-server, direct-stream' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[Agent Cloud API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * POST stream handler - streams with images passed as base64 in body
 */
async function handleStreamPost(
  request: NextRequest,
  sandboxId: string,
  prompt: string,
  images: Array<{ data: string; type: string; name: string }>
): Promise<Response> {
  return doStreaming(request, sandboxId, prompt, images)
}

/**
 * GET endpoint for streaming output (text-only, no images)
 * Uses ReadableStream with SSE format: "data: {...}\n\n"
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const sandboxId = searchParams.get('sandboxId')
  const prompt = searchParams.get('prompt') || ''

  if (!sandboxId || !prompt) {
    return NextResponse.json(
      { error: 'sandboxId and prompt are required for streaming' },
      { status: 400 }
    )
  }

  return doStreaming(request, sandboxId, prompt, [])
}

/**
 * Shared streaming logic for both GET (text-only) and POST stream (with images)
 */
async function doStreaming(
  request: NextRequest,
  sandboxId: string,
  prompt: string,
  images: Array<{ data: string; type: string; name?: string }>
): Promise<Response> {
  if (!sandboxId || (!prompt && images.length === 0)) {
    return NextResponse.json(
      { error: 'sandboxId and prompt (or images) are required for streaming' },
      { status: 400 }
    )
  }

  // Get Bonsai API key (round-robin rotation for load distribution)
  const aiGatewayKey = getNextBonsaiKey()
  if (!aiGatewayKey) {
    return NextResponse.json(
      { error: 'BONSAI_API_KEY not configured' },
      { status: 500 }
    )
  }

  // Find sandbox entry by sandboxId
  let sandboxEntry: (typeof activeSandboxes extends Map<string, infer V> ? V : never) | undefined = undefined
  let entryKey: string | undefined

  for (const [key, entry] of activeSandboxes.entries()) {
    if (entry.sandboxId === sandboxId) {
      sandboxEntry = entry
      entryKey = key
      break
    }
  }

  if (!sandboxEntry) {
    // Try to reconnect to the sandbox
    try {
      console.log(`[Agent Cloud] Attempting to reconnect to sandbox: ${sandboxId}`)
      const sandbox = await Sandbox.connect(sandboxId)

      // Create a temporary entry for this reconnected sandbox
      sandboxEntry = {
        sandboxId,
        sandbox,
        createdAt: new Date(),
        lastActivity: new Date(),
        userId: 'reconnected',
        conversationHistory: []
      }
    } catch (error) {
      console.error(`[Agent Cloud] Failed to reconnect to sandbox ${sandboxId}:`, error)
      return NextResponse.json(
        { error: 'Sandbox not found or expired. Create a new session.' },
        { status: 404 }
      )
    }
  }

  // Use stored working directory or fallback
  const workDir = sandboxEntry.workDir || '/home/user'

  // Add user message to conversation history
  sandboxEntry.conversationHistory.push({
    role: 'user',
    content: prompt,
    timestamp: new Date()
  })

  // Create a streaming response with real-time output (exactly like preview route)
  let isClosed = false
  const sandboxRef = sandboxEntry!.sandbox

  // Listen to client abort signal
  request.signal.addEventListener('abort', () => {
    if (!isClosed) {
      isClosed = true
      console.log('[Agent Cloud] Request aborted by client, killing agent process...')
      sandboxRef.commands.run('pkill -f claude-stream || true', { timeoutMs: 5000 }).catch(() => {})
      // Clean up images file on abort
      if (images.length > 0) {
        sandboxRef.commands.run(`rm -f ${SYSTEM_DIR}/.images.json`, { timeoutMs: 5000 }).catch(() => {})
      }
    }
  })

  const stream = new ReadableStream({
    async start(controller) {
      // Helper to safely send SSE-formatted data (matches preview route pattern)
      const send = (payload: object) => {
        if (!isClosed) {
          try {
            // SSE format: "data: {json}\n\n" - directly enqueue string
            controller.enqueue(`data: ${JSON.stringify(payload)}\n\n`)
          } catch (e) {
            isClosed = true
          }
        }
      }

      try {
        const { sandbox } = sandboxEntry!
        sandboxEntry!.lastActivity = new Date()

        // Send start event immediately
        send({ type: 'start', sandboxId })
        send({ type: 'log', message: 'Claude is thinking...' })

        // Use base64 encoding to safely pass prompts containing any characters
        // This avoids shell escaping issues with single quotes, $, backticks, etc.
        // Note: Conversation history is handled by the script reading the history file
        const base64Prompt = Buffer.from(prompt, 'utf-8').toString('base64')

        // Get the working branch for git workflow instructions
        const workingBranch = sandboxEntry!.workingBranch || 'main'

        // System prompt for git workflow - commit, push, and create PR using GitHub MCP
        const gitWorkflowPrompt = `
CRITICAL PROJECT DIRECTORY INFORMATION:
- PROJECT PATH: ${workDir}
- This is where ALL project source code is located
- ALWAYS cd to ${workDir} before running ANY commands (builds, installs, git, etc.)
- NEVER run npm/pnpm install or create files in /home/user directly - that is the system directory
- System tools and SDK are installed in /home/user (DO NOT modify this)
- Your project files are ONLY in: ${workDir}

IMPORTANT GIT WORKFLOW INSTRUCTIONS:
- You are working on branch: ${workingBranch}
- BEFORE committing, ALWAYS configure git user: git config user.name "pipilot-swe-bot" && git config user.email "hello@pipilot.dev"
- Do NOT use git config user.name "Claude" or user.email "noreply@anthropic.com"

INCREMENTAL COMMIT & PUSH (CRITICAL - prevents work loss):
- Do NOT wait until you finish everything to commit. Commit and push INCREMENTALLY as you build.
- After completing each meaningful unit of work (e.g. a new component, a feature, a config change, a bug fix), immediately:
  1. git add the relevant files
  2. git commit -m "descriptive message of what was done"
  3. git push -u origin ${workingBranch}
- Examples of when to commit & push:
  - After initial project setup / scaffolding
  - After adding each new component or page
  - After installing and configuring dependencies
  - After implementing each feature or fixing each bug
  - After adding styles or updating layouts
  - Before starting a risky or complex change
- This protects the user's work if the session disconnects, credits run out, or the sandbox closes.
- The user can always recover from the last pushed commit on reconnection.
- After ALL work is complete, use the GitHub MCP tools to create a pull request (you have GitHub MCP installed with authentication)
- Always provide meaningful commit messages and PR descriptions
- A .gitignore file exists in the project to prevent committing node_modules and other artifacts
`.trim()

        // Base64 encode the system prompt for safe shell passing
        const base64SystemPrompt = Buffer.from(gitWorkflowPrompt, 'utf-8').toString('base64')

        // Step 1: Upload the streaming script to the sandbox first
        const scriptContent = `#!/usr/bin/env node
import { query } from '@anthropic-ai/claude-agent-sdk';
import { readFileSync } from 'fs';

const promptArg = process.argv[2];
const systemPromptArg = process.argv[3];
const historyFileArg = process.argv[4];
const imagesFileArg = process.argv[5];

if (!promptArg) {
  console.error('Usage: node script.mjs <prompt> [systemPrompt] [historyFile] [imagesFile]');
  process.exit(1);
}

// Read images from JSON file if provided (contains array of {data, type})
let imageData = [];
if (imagesFileArg) {
  try {
    const raw = readFileSync(imagesFileArg, 'utf-8');
    imageData = JSON.parse(raw);
  } catch (e) {
    // Ignore read/parse errors
  }
}

// Check if prompt already contains embedded history (from recreated/expired session)
// If so, skip file-based history to avoid duplication
const hasEmbeddedHistory = promptArg.includes('[Conversation History') || promptArg.includes('[Current Request]');

let fullPrompt = '';
if (hasEmbeddedHistory) {
  // Recreated sandbox: history is already in the prompt from the client
  fullPrompt = promptArg;
} else {
  // Normal flow: read history from file (limited to last 6 pairs, truncated)
  let conversationHistory = [];
  if (historyFileArg) {
    try {
      const historyData = readFileSync(historyFileArg, 'utf-8');
      conversationHistory = JSON.parse(historyData);
    } catch (e) {
      // No history file yet (new project first message) - just use raw prompt
    }
  }

  const MAX_PAIRS = 6;
  const MAX_MSG_LENGTH = 800;
  const recentHistory = conversationHistory.slice(-(MAX_PAIRS * 2));

  if (recentHistory.length > 0) {
    const context = recentHistory
      .map(msg => {
        const content = msg.content.length > MAX_MSG_LENGTH
          ? msg.content.slice(0, MAX_MSG_LENGTH) + '...[truncated]'
          : msg.content;
        return \`\${msg.role === 'user' ? 'Human' : 'Assistant'}: \${content}\`;
      })
      .join('\\n\\n');
    fullPrompt = \`Previous conversation:\\n\${context}\\n\\nCurrent request: \${promptArg}\`;
  } else {
    fullPrompt = promptArg;
  }
}

// Configure MCP servers from environment variables
const mcpServers = {};
if (process.env.MCP_GATEWAY_URL) {
  mcpServers['tavily'] = {
    type: 'http',
    url: process.env.MCP_GATEWAY_URL
  };
}
if (process.env.GITHUB_TOKEN) {
  mcpServers['github'] = {
    type: 'http',
    url: 'https://api.githubcopilot.com/mcp',
    headers: {
      'Authorization': 'Bearer ' + process.env.GITHUB_TOKEN
    }
  };
}
// Playwright MCP for browser automation
mcpServers['playwright'] = {
  command: 'npx',
  args: ['@playwright/mcp@latest']
};
// Context7 MCP for documentation search
mcpServers['context7'] = {
  type: 'http',
  url: 'https://mcp.context7.com/mcp',
  headers: {
    CONTEXT7_API_KEY: 'ctx7sk-c1b4f8c7-a7a1-4646-b21b-fcd61160613b'
  }
};
// Sequential Thinking MCP for structured reasoning
mcpServers['sequential-thinking'] = {
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-sequential-thinking']
};
// Supabase MCP (user-configured connector)
if (process.env.SUPABASE_MCP_URL && process.env.SUPABASE_MCP_TOKEN) {
  mcpServers['supabase'] = {
    type: 'http',
    url: process.env.SUPABASE_MCP_URL,
    headers: {
      'Authorization': 'Bearer ' + process.env.SUPABASE_MCP_TOKEN
    }
  };
}

console.log(JSON.stringify({ type: 'start', timestamp: Date.now() }));

const abortController = new AbortController();
process.on('SIGTERM', () => abortController.abort());
process.on('SIGINT', () => abortController.abort());

// Build prompt - use async generator for multimodal (images), string for text-only
let promptInput;
if (imageData.length > 0) {
  const gen = async function*() {
    const contentParts = [];
    for (const img of imageData) {
      contentParts.push({
        type: 'image',
        source: { type: 'base64', media_type: img.type || 'image/png', data: img.data }
      });
    }
    contentParts.push({ type: 'text', text: fullPrompt || 'What is in this image?' });
    yield {
      type: 'user',
      message: { role: 'user', content: contentParts }
    };
  };
  promptInput = gen();
} else {
  promptInput = fullPrompt;
}

// Track if we've received streaming text deltas to avoid duplication from assistant messages
let hasStreamedText = false;

try {
  for await (const message of query({
    prompt: promptInput,
    options: {
      systemPrompt: systemPromptArg || undefined,
      abortController,
      includePartialMessages: true,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      enableFileCheckpointing: true,
      ...(Object.keys(mcpServers).length > 0 ? {
        mcpServers,
        allowedTools: Object.keys(mcpServers).map(k => 'mcp__' + k + '__*')
      } : {})
    }
  })) {
    if (message.type === 'stream_event') {
      const event = message.event;
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        hasStreamedText = true;
        const cleaned = event.delta.text.replace(/^@bonsai:[^\\n]*\\n?/gm, '');
        if (cleaned) console.log(JSON.stringify({ type: 'text', data: cleaned, timestamp: Date.now() }));
      } else if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
        console.log(JSON.stringify({ type: 'tool_use', name: event.content_block.name, input: {}, timestamp: Date.now() }));
      }
    } else if (message.type === 'assistant') {
      // IMPORTANT: Only process tool_use blocks here - text is already streamed via stream_event
      // Do NOT emit text from assistant messages to avoid duplication in multi-turn conversations
      const content = message.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_use') {
            console.log(JSON.stringify({ type: 'tool_use', name: block.name, input: block.input, timestamp: Date.now() }));
          }
        }
      }
    } else if (message.type === 'user') {
      // User messages contain tool_result blocks
      const content = message.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_result') {
            let resultContent = '';
            if (Array.isArray(block.content)) {
              const parts = block.content.map((c) => {
                if (c.type === 'text') return c.text;
                return '[' + c.type + ']';
              });
              resultContent = parts.join('\\n');
            } else if (typeof block.content === 'string') {
              resultContent = block.content;
            } else {
              resultContent = JSON.stringify(block.content);
            }
            console.log(JSON.stringify({
              type: 'tool_result',
              tool_use_id: block.tool_use_id,
              result: (resultContent || '').substring(0, 2000),
              timestamp: Date.now()
            }));
          }
        }
      }
    } else if (message.type === 'result') {
      console.log(JSON.stringify({ type: 'result', subtype: message.subtype, result: message.result, cost: message.total_cost_usd, timestamp: Date.now() }));
    }
  }
  console.log(JSON.stringify({ type: 'complete', timestamp: Date.now() }));
  process.exit(0);
} catch (error) {
  console.error(JSON.stringify({ type: 'error', message: error.message || String(error), timestamp: Date.now() }));
  process.exit(1);
}
`
        // Write script to SYSTEM_DIR (not project dir) to avoid polluting project
        await sandbox.files.write(`${SYSTEM_DIR}/claude-stream.mjs`, scriptContent)
        console.log(`[Agent Cloud] Streaming script uploaded to ${SYSTEM_DIR}`)

        // Step 2: Build a single chained command that installs SDK (if needed) AND runs the script
        // SDK and script are in SYSTEM_DIR, but Claude works on files in workDir (project)
        send({ type: 'log', message: 'Preparing Claude Agent SDK...' })

        // Write images as JSON file if present (in SYSTEM_DIR to avoid polluting project)
        if (images.length > 0) {
          const imagesJson = JSON.stringify(images.map(img => ({ data: img.data, type: img.type })))
          await sandbox.files.write(`${SYSTEM_DIR}/.images.json`, imagesJson)
        }
        const imageArg = images.length > 0 ? ` "${SYSTEM_DIR}/.images.json"` : ''

        // Install SDK in SYSTEM_DIR, then run script (Claude works in workDir via --directory flag)
        const command = `cd ${SYSTEM_DIR} && ([ -f package.json ] || echo '{"type":"module"}' > package.json) && pnpm add @anthropic-ai/claude-agent-sdk && node claude-stream.mjs "$(echo '${base64Prompt}' | base64 -d)" "$(echo '${base64SystemPrompt}' | base64 -d)" "${HISTORY_FILE}"${imageArg}`

        console.log(`[Agent Cloud] Executing chained install & run command (SDK in ${SYSTEM_DIR}, project in ${workDir})`)

        let fullOutput = ''
        let textContent = '' // Accumulate text for conversation history
        let jsonBuffer = '' // Buffer for incomplete JSON lines
        let sdkStarted = false // Track when SDK script starts (to filter install noise)
        const bonsaiFilter = createBonsaiFilter() // Stateful filter for @bonsai: lines

        // Start heartbeat to keep connection alive
        const heartbeatInterval = setInterval(() => {
          if (!isClosed) {
            send({ type: 'heartbeat', timestamp: Date.now() })
          }
        }, 15000) // Send heartbeat every 15 seconds

        try {
          const result = await sandbox.commands.run(command, {
            cwd: SYSTEM_DIR, // Run from system dir where SDK is installed
            timeoutMs: 0, // No timeout
            envs: {
              // Pass environment variables for Claude Agent SDK
              ANTHROPIC_BASE_URL: AI_GATEWAY_BASE_URL,
              ANTHROPIC_AUTH_TOKEN: aiGatewayKey,
              ANTHROPIC_API_KEY: '', // Must be empty
              // Selected model goes into sonnet slot (Claude Code's default tier)
              ANTHROPIC_DEFAULT_SONNET_MODEL: AVAILABLE_MODELS[(sandboxEntry!.model as keyof typeof AVAILABLE_MODELS) || 'sonnet'] || AVAILABLE_MODELS.sonnet,
              ANTHROPIC_DEFAULT_OPUS_MODEL: AVAILABLE_MODELS.opus,
              ANTHROPIC_DEFAULT_HAIKU_MODEL: AVAILABLE_MODELS.haiku,
              // Playwright browser path (0 = use node_modules local install)
              PLAYWRIGHT_BROWSERS_PATH: '0',
              // MCP gateway - Tavily HTTP MCP for web search
              ...(sandboxEntry!.mcpGatewayUrl ? { MCP_GATEWAY_URL: sandboxEntry!.mcpGatewayUrl } : {}),
            },
            onStdout: (data) => {
              if (isClosed) return
              fullOutput += data
              
              // Log raw data for debugging
              console.log(`[Agent Cloud] 📤 Raw stdout chunk (${data.length} bytes):`, data.substring(0, 200))

              // Parse JSON lines from stream-json output
              jsonBuffer += data
              const lines = jsonBuffer.split('\n')
              jsonBuffer = lines.pop() || '' // Keep incomplete line in buffer

              for (const line of lines) {
                if (!line.trim()) continue

                try {
                  const message = JSON.parse(line)
                  
                  // Log message types (skip noisy ones)
                  if (!['user', 'system'].includes(message.type)) {
                    console.log(`[Agent Cloud] 📨 Parsed message type: ${message.type}`)
                  }

                  // Mark SDK as started when we receive the first message
                  if (!sdkStarted && message.type === 'start') {
                    sdkStarted = true
                  }

                  // Handle different message types from Agent SDK stream output
                  if (message.type === 'text') {
                    const cleaned = bonsaiFilter(message.data || '')
                    if (cleaned) {
                      textContent += cleaned
                      send({ type: 'text', data: cleaned, timestamp: Date.now() })
                    }
                  } else if (message.type === 'tool_use') {
                    send({
                      type: 'tool_use',
                      name: message.name,
                      input: message.input,
                      timestamp: Date.now()
                    })
                  } else if (message.type === 'tool_result') {
                    send({
                      type: 'tool_result',
                      result: typeof message.result === 'string'
                        ? message.result.substring(0, 2000)
                        : message.result,
                      timestamp: Date.now()
                    })
                  } else if (message.type === 'result') {
                    send({
                      type: 'result',
                      subtype: message.subtype,
                      result: message.result,
                      cost: message.total_cost_usd,
                      timestamp: Date.now()
                    })
                  } else if (message.type === 'assistant') {
                    // Skip - text already accumulated via 'text' message type from the SDK script
                    // Don't accumulate again to avoid duplicate text in history
                  } else if (message.type === 'content_block_delta') {
                    // Skip - already handled by the SDK script which emits 'text' type
                    // Don't accumulate again to avoid duplicate text
                  } else if (message.type === 'content_block_start') {
                    // Already handled by the script's stream_event handler which emits 'tool_use' type
                    // No action needed here
                  } else if (['user', 'system'].includes(message.type)) {
                    // Skip conversation history messages - don't send to frontend
                    // These are just Claude loading context, not actual output
                  } else {
                    // Log unknown message types for debugging
                    console.log(`[Agent Cloud] Unknown message type: ${message.type}`, JSON.stringify(message).substring(0, 200))
                  }
                } catch (parseErr) {
                  // Only forward non-JSON output after SDK has started
                  // This filters out pnpm install progress/noise before the script runs
                  if (sdkStarted && line.trim()) {
                    send({ type: 'stdout', data: line, timestamp: Date.now() })
                  }
                }
              }
            },
            onStderr: (data) => {
              if (isClosed) return
              send({ type: 'stderr', data, timestamp: Date.now() })
            }
          })

          // Clear heartbeat
          clearInterval(heartbeatInterval)

          // Add assistant response to conversation history (use textContent for cleaner history)
          sandboxEntry!.conversationHistory.push({
            role: 'assistant',
            content: textContent || fullOutput,
            timestamp: new Date()
          })

          // Save conversation history to sandbox for persistence
          try {
            await sandbox.files.write(
              HISTORY_FILE,
              JSON.stringify(sandboxEntry!.conversationHistory, null, 2)
            )
          } catch (e) {
            console.warn('[Agent Cloud] Failed to save conversation history:', e)
          }

          // Get git diff stats if repo is cloned
          let diffStats = { additions: 0, deletions: 0 }
          if (sandboxEntry!.repo?.cloned) {
            try {
              const diffResult = await sandbox.commands.run(
                `cd ${workDir} && git diff --shortstat`,
                { timeoutMs: 5000 }
              )
              const match = diffResult.stdout?.match(/(\d+) insertion.*?(\d+) deletion/)
              if (match) {
                diffStats = { additions: parseInt(match[1]), deletions: parseInt(match[2]) }
              }
            } catch (e) {
              // Ignore diff errors
            }
          }

          // Send completion event
          send({
            type: 'complete',
            exitCode: result.exitCode,
            output: fullOutput,
            diffStats,
            messageCount: sandboxEntry!.conversationHistory.length
          })

          // Clean up images file after stream completes
          if (images.length > 0) {
            sandbox.commands.run(`rm -f ${SYSTEM_DIR}/.images.json`, { timeoutMs: 5000 }).catch(() => {})
          }

        } catch (cmdError) {
          clearInterval(heartbeatInterval)
          throw cmdError
        }

        isClosed = true
        controller.close()
      } catch (error) {
        send({
          type: 'error',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
        isClosed = true
        controller.close()
      }
    },
    cancel() {
      // Called when client disconnects (aborts fetch)
      isClosed = true
      console.log('[Agent Cloud] Client disconnected, killing agent process...')
      // Kill the claude-stream process in the sandbox
      sandboxRef.commands.run('pkill -f claude-stream || true', { timeoutMs: 5000 }).catch(() => {})
      // Clean up images file on disconnect
      if (images.length > 0) {
        sandboxRef.commands.run(`rm -f ${SYSTEM_DIR}/.images.json`, { timeoutMs: 5000 }).catch(() => {})
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    }
  })
}

/**
 * Create or reconnect to a sandbox session
 * If user already has a sandbox for this repo, reconnect to it
 */
async function handleCreate(
  request: NextRequest,
  config?: {
    model?: 'sonnet' | 'opus' | 'haiku'
    template?: string
    repo?: {
      full_name: string
      branch: string
    }
    newProject?: {
      name: string // The repo name to create on GitHub
    }
    initialPrompt?: string // Used to generate branch name from first 4 words
    connectors?: Array<{
      id: string
      type: 'mcp' | 'cli'
      mcpUrl?: string
      fields: Record<string, string>
    }>
  }
) {
  // Cleanup old sandboxes first
  cleanupInactiveSandboxes()

  // Get current user
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    )
  }

  const userId = user.id

  // Get Bonsai API key (round-robin rotation for load distribution)
  const aiGatewayKey = getNextBonsaiKey()
  if (!aiGatewayKey) {
    return NextResponse.json(
      { error: 'BONSAI_API_KEY not configured. Add it to your environment variables.' },
      { status: 500 }
    )
  }

  // Create sandbox key for this user/repo combination
  const sandboxKey = config?.repo
    ? `${userId}-${config.repo.full_name}`
    : config?.newProject
      ? `${userId}-new-${config.newProject.name}`
      : `${userId}-default`

  // Check if we already have an active sandbox for this user/repo
  const existingEntry = activeSandboxes.get(sandboxKey)
  if (existingEntry) {
    try {
      // Try to reconnect to verify it's still alive
      console.log(`[Agent Cloud] Reconnecting to existing sandbox: ${existingEntry.sandboxId}`)
      const sandbox = await Sandbox.connect(existingEntry.sandboxId)

      // Update the entry
      existingEntry.sandbox = sandbox
      existingEntry.lastActivity = new Date()

      console.log(`[Agent Cloud] Reconnected to sandbox: ${existingEntry.sandboxId}`)

      return NextResponse.json({
        success: true,
        sandboxId: existingEntry.sandboxId,
        model: AVAILABLE_MODELS[existingEntry.model as keyof typeof AVAILABLE_MODELS || 'sonnet'],
        gateway: AI_GATEWAY_BASE_URL,
        repoCloned: existingEntry.repo?.cloned || false,
        projectDir: existingEntry.workDir || SYSTEM_DIR,
        reconnected: true,
        messageCount: existingEntry.conversationHistory.length,
        workingBranch: existingEntry.workingBranch, // Include working branch for header display
        message: 'Reconnected to existing sandbox',
      })
    } catch (error) {
      console.log(`[Agent Cloud] Existing sandbox expired, creating new one`)
      activeSandboxes.delete(sandboxKey)
    }
  }

  // Also check E2B for any running sandboxes with matching metadata
  try {
    const paginator = Sandbox.list({
      query: {
        state: ['running'],
        metadata: { userId, repo: config?.repo?.full_name || 'default' }
      }
    })
    const runningSandboxes = await paginator.nextItems()

    if (runningSandboxes.length > 0) {
      const existingSandbox = runningSandboxes[0]
      console.log(`[Agent Cloud] Found running sandbox in E2B: ${existingSandbox.sandboxId}`)

      try {
        const sandbox = await Sandbox.connect(existingSandbox.sandboxId)

        // Load conversation history from sandbox if exists
        let conversationHistory: any[] = []
        try {
          const historyContent = await sandbox.files.read(HISTORY_FILE)
          conversationHistory = JSON.parse(historyContent)
        } catch (e) {
          // No history file yet
        }

        // Try to get the current working branch and project directory from the sandbox
        let workingBranch: string | undefined
        let detectedWorkDir: string | undefined
        try {
          // First try to find where the project was cloned
          const findResult = await sandbox.commands.run(
            `ls -d ${PROJECT_BASE_DIR}/*/ 2>/dev/null | head -1`,
            { timeoutMs: 5000 }
          )
          if (findResult.exitCode === 0 && findResult.stdout?.trim()) {
            detectedWorkDir = findResult.stdout.trim().replace(/\/$/, '')
            console.log(`[Agent Cloud] Detected project directory: ${detectedWorkDir}`)
          }

          const projectDir = detectedWorkDir || PROJECT_BASE_DIR
          const branchResult = await sandbox.commands.run(
            `cd ${projectDir} && git rev-parse --abbrev-ref HEAD 2>/dev/null`,
            { timeoutMs: 5000 }
          )
          if (branchResult.exitCode === 0 && branchResult.stdout?.trim()) {
            workingBranch = branchResult.stdout.trim()
            console.log(`[Agent Cloud] Found working branch in sandbox: ${workingBranch}`)
          }
        } catch (e) {
          // Couldn't get branch, that's ok
        }

        const reconnectedWorkDir = detectedWorkDir || PROJECT_BASE_DIR
        const entry = {
          sandboxId: existingSandbox.sandboxId,
          sandbox,
          createdAt: existingSandbox.startedAt,
          lastActivity: new Date(),
          model: config?.model || 'sonnet',
          userId,
          repo: config?.repo ? {
            full_name: config.repo.full_name,
            branch: config.repo.branch,
            cloned: true // Assume cloned if sandbox exists
          } : undefined,
          workingBranch,
          workDir: reconnectedWorkDir,
          conversationHistory
        }

        activeSandboxes.set(sandboxKey, entry)

        return NextResponse.json({
          success: true,
          sandboxId: existingSandbox.sandboxId,
          model: AVAILABLE_MODELS[config?.model || 'sonnet'],
          gateway: AI_GATEWAY_BASE_URL,
          repoCloned: true,
          projectDir: reconnectedWorkDir,
          reconnected: true,
          messageCount: conversationHistory.length,
          workingBranch, // Include working branch for header display
          message: 'Reconnected to running sandbox from E2B',
        })
      } catch (error) {
        console.warn(`[Agent Cloud] Failed to reconnect to E2B sandbox:`, error)
      }
    }
  } catch (error) {
    console.warn(`[Agent Cloud] Failed to list E2B sandboxes:`, error)
  }

  // Get GitHub token if repo is specified
  let githubToken: string | undefined
  if (config?.repo) {
    try {
      // Query user_settings directly using the server supabase client (which has auth context)
      const { data: settings } = await supabase
        .from('user_settings')
        .select('github_token')
        .eq('user_id', userId)
        .single()
      githubToken = settings?.github_token || undefined
    } catch (e) {
      console.warn('[Agent Cloud] Failed to get GitHub token from DB:', e)
    }

    // Fallback: use token passed from frontend via header
    if (!githubToken) {
      const headerToken = request.headers.get('X-GitHub-Token')
      if (headerToken) {
        githubToken = headerToken
        console.log(`[Agent Cloud] Using GitHub token from client header (fallback)`)
      }
    }

    console.log(`[Agent Cloud] GitHub token available: ${!!githubToken}`)
  }

  // Configure environment variables for Claude Code with Bonsai AI Gateway
  // The user's selected model becomes the sonnet tier (Claude Code's default)
  const selectedModelId = AVAILABLE_MODELS[(config?.model || 'sonnet') as keyof typeof AVAILABLE_MODELS] || AVAILABLE_MODELS.sonnet
  const envs: Record<string, string> = {
    // Bonsai AI Gateway configuration
    ANTHROPIC_BASE_URL: AI_GATEWAY_BASE_URL,
    ANTHROPIC_AUTH_TOKEN: aiGatewayKey,
    ANTHROPIC_API_KEY: '', // Must be empty - Claude Code checks this first

    // Model overrides via Bonsai - selected model goes into sonnet slot (default tier)
    ANTHROPIC_DEFAULT_SONNET_MODEL: selectedModelId,
    ANTHROPIC_DEFAULT_OPUS_MODEL: AVAILABLE_MODELS.opus,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: AVAILABLE_MODELS.haiku,

    // Playwright configuration
    PLAYWRIGHT_BROWSERS_PATH: '0',
  }

  // Add GitHub token if available (set both for gh CLI and git/SDK compatibility)
  if (githubToken) {
    envs.GITHUB_TOKEN = githubToken
    envs.GH_TOKEN = githubToken
  }

  // Add connector environment variables (CLI tokens and MCP configs)
  if (config?.connectors) {
    for (const connector of config.connectors) {
      switch (connector.id) {
        case 'vercel':
          if (connector.fields.token) envs.VERCEL_TOKEN = connector.fields.token
          break
        case 'netlify':
          if (connector.fields.token) envs.NETLIFY_AUTH_TOKEN = connector.fields.token
          break
        case 'npm':
          if (connector.fields.token) envs.NPM_TOKEN = connector.fields.token
          break
        case 'neon':
          if (connector.fields.api_key) envs.NEON_API_KEY = connector.fields.api_key
          break
        case 'cloudflare':
          if (connector.fields.api_token) envs.CLOUDFLARE_API_TOKEN = connector.fields.api_token
          break
        case 'railway':
          if (connector.fields.token) envs.RAILWAY_TOKEN = connector.fields.token
          break
        case 'turso':
          if (connector.fields.token) envs.TURSO_AUTH_TOKEN = connector.fields.token
          break
        case 'supabase':
          // Supabase MCP connector - store URL and token for script to pick up
          if (connector.fields.project_ref && connector.fields.access_token) {
            envs.SUPABASE_MCP_URL = `https://mcp.supabase.com/mcp?project_ref=${connector.fields.project_ref}`
            envs.SUPABASE_MCP_TOKEN = connector.fields.access_token
          }
          break
      }
    }
    console.log(`[Agent Cloud] Connectors configured: ${config.connectors.map(c => c.id).join(', ')}`)
  }

  // Use our custom E2B template (pipilot-agent) which has Claude Code + Playwright pre-installed
  const template = config?.template || 'pipilot-agent'
  const selectedModel = config?.model || 'sonnet'

  console.log(`[Agent Cloud] Creating new sandbox with template: ${template}`)
  console.log(`[Agent Cloud] Using Bonsai AI Gateway: ${AI_GATEWAY_BASE_URL}`)
  console.log(`[Agent Cloud] Default model: ${AVAILABLE_MODELS[selectedModel]}`)

  // Create sandbox (MCP is configured directly in Claude Agent SDK script)
  const sandbox = await Sandbox.create(template, {
    timeoutMs: 30 * 60 * 1000, // 30 minutes timeout
    envs,
    metadata: {
      userId,
      repo: config?.repo?.full_name || 'default',
      model: selectedModel
    }
  })

  const sandboxId = sandbox.sandboxId
  let repoCloned = false
  let actualWorkDir = SYSTEM_DIR // Will be updated to repo subfolder if cloning

  // Create project base directory (separate from system dir)
  await sandbox.commands.run(`mkdir -p ${PROJECT_BASE_DIR}`, { timeoutMs: 5000 })
  console.log(`[Agent Cloud] Project base directory created: ${PROJECT_BASE_DIR}`)

  // Configure CLI connector auth files in the sandbox
  if (config?.connectors) {
    for (const connector of config.connectors) {
      try {
        switch (connector.id) {
          case 'npm':
            if (connector.fields.token) {
              await sandbox.commands.run(
                `echo "//registry.npmjs.org/:_authToken=${connector.fields.token}" > /home/user/.npmrc`,
                { timeoutMs: 5000 }
              )
              console.log(`[Agent Cloud] npm auth configured`)
            }
            break
          case 'neon':
            if (connector.fields.api_key) {
              // neonctl uses NEON_API_KEY env var (already set above)
              console.log(`[Agent Cloud] Neon CLI configured via env`)
            }
            break
          case 'turso':
            if (connector.fields.token) {
              // turso uses config file
              await sandbox.commands.run(
                `mkdir -p /home/user/.config/turso && echo '{"token":"${connector.fields.token}"}' > /home/user/.config/turso/config.json`,
                { timeoutMs: 5000 }
              )
              console.log(`[Agent Cloud] Turso CLI configured`)
            }
            break
        }
      } catch (e) {
        console.warn(`[Agent Cloud] Failed to configure ${connector.id}:`, e)
      }
    }
  }

  // MCP is configured directly in the Claude Agent SDK script via mcpServers option
  // Using Tavily HTTP MCP for web search, Playwright MCP for browser automation
  const mcpGatewayUrl = 'https://mcp.tavily.com/mcp/?tavilyApiKey=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'
  console.log(`[Agent Cloud] MCP gateway configured: Tavily, Playwright, GitHub, Context7, Sequential Thinking`)

  // Track the working branch created for this session
  let createdWorkingBranch: string | undefined

  // Clone repo if specified (supports both public and private repos)
  if (config?.repo) {
    try {
      console.log(`[Agent Cloud] Cloning repo: ${config.repo.full_name} (${config.repo.branch})`)

      // Extract repo name for subfolder under project base directory
      const repoName = config.repo.full_name.split('/').pop() || 'project'
      const repoDir = `${PROJECT_BASE_DIR}/${repoName}`

      // Validate token and repo access before attempting clone
      if (githubToken) {
        try {
          const repoCheckResponse = await fetch(
            `https://api.github.com/repos/${config.repo.full_name}`,
            {
              headers: {
                'Authorization': `Bearer ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'PiPilot-Agent-Cloud',
              },
            }
          )

          if (repoCheckResponse.ok) {
            console.log(`[Agent Cloud] Token validated - repo accessible`)
          } else if (repoCheckResponse.status === 401) {
            console.warn(`[Agent Cloud] GitHub token expired/invalid (401) - falling back to public clone`)
            githubToken = undefined
          } else if (repoCheckResponse.status === 403) {
            console.warn(`[Agent Cloud] GitHub token lacks repo access (403) - falling back to public clone`)
            githubToken = undefined
          } else if (repoCheckResponse.status === 404) {
            console.warn(`[Agent Cloud] Repo not found or no access (404) - will attempt public clone`)
            githubToken = undefined
          }
        } catch (checkError) {
          console.warn(`[Agent Cloud] Token validation request failed:`, checkError)
          // Continue with the token anyway - the clone might still work
        }
      }

      // Create the repo subdirectory and clone into it
      await sandbox.commands.run(`mkdir -p ${repoDir}`, { timeoutMs: 5000 })

      // Clone repo into the subdirectory
      let cloneSuccess = false

      if (githubToken) {
        // Method 1: git clone with token into subfolder
        try {
          console.log(`[Agent Cloud] Cloning with token into ${repoDir}...`)
          const gitResult = await sandbox.commands.run(
            `cd ${repoDir} && git init && (git remote add origin https://x-access-token:${githubToken}@github.com/${config.repo.full_name}.git 2>/dev/null || git remote set-url origin https://x-access-token:${githubToken}@github.com/${config.repo.full_name}.git) && git fetch --depth 50 origin ${config.repo.branch} && git checkout -f ${config.repo.branch}`,
            { timeoutMs: 180000 }
          )
          if (gitResult.exitCode === 0) {
            cloneSuccess = true
            console.log(`[Agent Cloud] Repo cloned successfully into ${repoDir}`)
          } else {
            console.warn(`[Agent Cloud] git init+fetch failed:`, gitResult.stderr)
          }
        } catch (gitError: any) {
          console.warn(`[Agent Cloud] git init+fetch error:`, gitError?.result?.stderr || gitError?.message)
        }
      }

      // Method 2: Public clone (no auth, git init + fetch)
      if (!cloneSuccess) {
        try {
          console.log(`[Agent Cloud] Attempting public clone into ${repoDir}...`)
          const publicResult = await sandbox.commands.run(
            `cd ${repoDir} && git init && (git remote add origin https://github.com/${config.repo.full_name}.git 2>/dev/null || git remote set-url origin https://github.com/${config.repo.full_name}.git) && git fetch --depth 50 origin ${config.repo.branch} && git checkout -f ${config.repo.branch}`,
            { timeoutMs: 180000 }
          )
          if (publicResult.exitCode === 0) {
            cloneSuccess = true
            console.log(`[Agent Cloud] Repo cloned successfully into ${repoDir}`)
          } else {
            console.warn(`[Agent Cloud] Public clone failed:`, publicResult.stderr)
          }
        } catch (publicError: any) {
          console.warn(`[Agent Cloud] Public clone error:`, publicError?.result?.stderr || publicError?.message)
        }
      }

      if (cloneSuccess) {
        repoCloned = true
        // Store the actual repo directory for later use
        actualWorkDir = repoDir
        console.log(`[Agent Cloud] Repo cloned successfully to ${repoDir}`)

        // Configure git user
        await sandbox.commands.run(
          `cd ${repoDir} && git config user.email "hello@pipilot.dev" && git config user.name "pipilot-swe-bot"`,
          { timeoutMs: 5000 }
        )

        // Create a new working branch for Claude's changes using the prompt
        const workingBranch = generateBranchName(config?.initialPrompt || 'agent-task')
        const branchResult = await sandbox.commands.run(
          `cd ${repoDir} && git checkout -b ${workingBranch}`,
          { timeoutMs: 10000 }
        )

        if (branchResult.exitCode === 0) {
          console.log(`[Agent Cloud] Created working branch: ${workingBranch}`)
          createdWorkingBranch = workingBranch
        } else {
          console.warn(`[Agent Cloud] Failed to create working branch:`, branchResult.stderr)
        }

        // Install project dependencies if package.json exists
        console.log(`[Agent Cloud] Checking for project dependencies...`)
        try {
          const depsResult = await sandbox.commands.run(
            `cd ${repoDir} && [ -f package.json ] && npm install || echo "No package.json"`,
            { timeoutMs: 180000 }
          )
          if (depsResult.stdout?.includes('No package.json')) {
            console.log(`[Agent Cloud] No package.json found, skipping npm install`)
          } else {
            console.log(`[Agent Cloud] Dependencies installed`)
          }
        } catch (e) {
          console.warn(`[Agent Cloud] Dependency installation warning:`, e)
        }

        // Ensure .gitignore exists to prevent committing node_modules and artifacts
        try {
          const gitignoreCheck = await sandbox.commands.run(
            `cd ${repoDir} && [ -f .gitignore ] && echo "exists" || echo "missing"`,
            { timeoutMs: 5000 }
          )
          if (gitignoreCheck.stdout?.includes('missing')) {
            // Create default .gitignore for new repos without one
            await sandbox.files.write(`${repoDir}/.gitignore`, DEFAULT_GITIGNORE)
            console.log(`[Agent Cloud] Created default .gitignore in ${repoDir}`)
          } else {
            // Append node_modules if not already in existing .gitignore
            const appendResult = await sandbox.commands.run(
              `cd ${repoDir} && grep -q "^node_modules" .gitignore || echo "node_modules/" >> .gitignore`,
              { timeoutMs: 5000 }
            )
            console.log(`[Agent Cloud] Ensured node_modules is in .gitignore`)
          }
        } catch (e) {
          console.warn(`[Agent Cloud] Failed to setup .gitignore:`, e)
        }
      } else {
        console.error(`[Agent Cloud] All clone methods failed for ${config.repo.full_name}`)
      }
    } catch (error: any) {
      console.error(`[Agent Cloud] Clone error:`, error?.message || error)
    }
  }

  // Handle new project mode (no repo to clone, just initialize git)
  if (config?.newProject && !config?.repo) {
    try {
      const projectName = config.newProject.name || 'new-project'
      const projectDir = `${PROJECT_BASE_DIR}/${projectName}`
      console.log(`[Agent Cloud] New project mode: initializing ${projectName} in ${projectDir}`)

      // Create project directory and initialize git
      await sandbox.commands.run(
        `mkdir -p ${projectDir} && cd ${projectDir} && git init && git config user.email "hello@pipilot.dev" && git config user.name "pipilot-swe-bot"`,
        { timeoutMs: 10000 }
      )

      // Create default .gitignore for new projects
      await sandbox.files.write(`${projectDir}/.gitignore`, DEFAULT_GITIGNORE)
      console.log(`[Agent Cloud] Created default .gitignore for new project`)

      actualWorkDir = projectDir
      repoCloned = false // No clone, fresh project
      console.log(`[Agent Cloud] Git initialized for new project: ${projectName} in ${projectDir}`)
    } catch (error: any) {
      console.error(`[Agent Cloud] New project git init error:`, error?.message || error)
    }
  }

  // Store sandbox entry with the working branch and directory
  activeSandboxes.set(sandboxKey, {
    sandboxId,
    sandbox,
    createdAt: new Date(),
    lastActivity: new Date(),
    model: selectedModel,
    userId,
    repo: config?.repo ? {
      full_name: config.repo.full_name,
      branch: config.repo.branch,
      cloned: repoCloned,
    } : undefined,
    workingBranch: createdWorkingBranch,
    workDir: actualWorkDir,
    mcpGatewayUrl,
    conversationHistory: []
  })

  // Auto-provision empty conversation history file so the script can read/write immediately
  try {
    await sandbox.files.write(HISTORY_FILE, '[]')
    console.log(`[Agent Cloud] History file provisioned at ${HISTORY_FILE}`)
  } catch (e) {
    console.warn(`[Agent Cloud] Failed to provision history file:`, e)
  }

  console.log(`[Agent Cloud] Sandbox created: ${sandboxId}, working branch: ${createdWorkingBranch || 'none'}`)

  return NextResponse.json({
    success: true,
    sandboxId,
    model: AVAILABLE_MODELS[selectedModel],
    gateway: AI_GATEWAY_BASE_URL,
    repoCloned,
    isNewProject: !!config?.newProject,
    newProjectName: config?.newProject?.name,
    projectDir: actualWorkDir,
    reconnected: false,
    messageCount: 0,
    mcpEnabled: !!mcpGatewayUrl,
    mcpTools: ['tavily', 'playwright', 'context7', 'sequential-thinking'],
    workingBranch: createdWorkingBranch,
    message: config?.newProject
      ? `Sandbox created for new project: ${config.newProject.name} (MCP enabled)`
      : repoCloned
        ? `Sandbox created with ${config?.repo?.full_name} cloned (MCP enabled)`
        : 'Sandbox created with Bonsai AI Gateway (MCP enabled)',
  })
}

/**
 * Run a Claude Code prompt
 */
async function handleRun(
  sandboxId: string,
  prompt: string,
  options?: {
    workingDirectory?: string
    timeoutMs?: number
  }
) {
  if (!sandboxId || !prompt) {
    return NextResponse.json(
      { error: 'sandboxId and prompt are required' },
      { status: 400 }
    )
  }

  // Find sandbox entry
  let sandboxEntry: (typeof activeSandboxes extends Map<string, infer V> ? V : never) | undefined = undefined

  for (const [key, entry] of activeSandboxes.entries()) {
    if (entry.sandboxId === sandboxId) {
      sandboxEntry = entry
      break
    }
  }

  if (!sandboxEntry) {
    // Try to reconnect
    try {
      const sandbox = await Sandbox.connect(sandboxId)
      sandboxEntry = {
        sandboxId,
        sandbox,
        createdAt: new Date(),
        lastActivity: new Date(),
        userId: 'reconnected',
        conversationHistory: []
      }
    } catch (error) {
      return NextResponse.json(
        { error: 'Sandbox not found or expired. Create a new session.' },
        { status: 404 }
      )
    }
  }

  const { sandbox } = sandboxEntry
  sandboxEntry.lastActivity = new Date()

  // Use stored working directory, or specified, or default
  const workDir = options?.workingDirectory || sandboxEntry.workDir || SYSTEM_DIR

  // Add to conversation history
  sandboxEntry.conversationHistory.push({
    role: 'user',
    content: prompt,
    timestamp: new Date()
  })

  // Use base64 encoding to safely pass prompts containing any characters
  const base64Prompt = Buffer.from(prompt, 'utf-8').toString('base64')
  const command = `cd ${workDir} && echo '${base64Prompt}' | base64 -d | claude -p --dangerously-skip-permissions`

  console.log(`[Agent Cloud] Running Claude Code in sandbox ${sandboxId}`)

  let stdout = ''
  let stderr = ''

  const result = await sandbox.commands.run(command, {
    timeoutMs: options?.timeoutMs || 0,
    onStdout: (data) => {
      stdout += data
    },
    onStderr: (data) => {
      stderr += data
    }
  })

  // Add assistant response to history
  sandboxEntry.conversationHistory.push({
    role: 'assistant',
    content: stdout,
    timestamp: new Date()
  })

  // Get recently modified files
  const filesResult = await sandbox.commands.run(
    `find ${workDir} -type f -mmin -5 2>/dev/null | head -50`,
    { timeoutMs: 10000 }
  )
  const files = filesResult.stdout?.split('\n').filter(Boolean) || []

  return NextResponse.json({
    success: true,
    stdout: stdout || result.stdout || '',
    stderr: stderr || result.stderr || '',
    exitCode: result.exitCode || 0,
    files,
    messageCount: sandboxEntry.conversationHistory.length
  })
}

/**
 * Run a Playwright script
 */
async function handlePlaywright(sandboxId: string, script: string) {
  if (!sandboxId || !script) {
    return NextResponse.json(
      { error: 'sandboxId and script are required' },
      { status: 400 }
    )
  }

  // Find sandbox entry
  let sandboxEntry: (typeof activeSandboxes extends Map<string, infer V> ? V : never) | undefined = undefined

  for (const [key, entry] of activeSandboxes.entries()) {
    if (entry.sandboxId === sandboxId) {
      sandboxEntry = entry
      break
    }
  }

  if (!sandboxEntry) {
    return NextResponse.json(
      { error: 'Sandbox not found' },
      { status: 404 }
    )
  }

  const { sandbox } = sandboxEntry
  sandboxEntry.lastActivity = new Date()

  // Write script to sandbox
  const scriptPath = '/app/agent-script.mjs'
  await sandbox.files.write(scriptPath, script)

  console.log(`[Agent Cloud] Running Playwright script in sandbox ${sandboxId}`)

  let stdout = ''
  let stderr = ''

  const result = await sandbox.commands.run(
    `PLAYWRIGHT_BROWSERS_PATH=0 node ${scriptPath}`,
    {
      cwd: '/app',
      onStdout: (data) => {
        stdout += data
      },
      onStderr: (data) => {
        stderr += data
      }
    }
  )

  // Find screenshots
  const screenshotsResult = await sandbox.commands.run(
    'find /home/user -name "*.png" -mmin -5 2>/dev/null',
    { timeoutMs: 5000 }
  )
  const screenshots = screenshotsResult.stdout?.split('\n').filter(Boolean) || []

  return NextResponse.json({
    success: true,
    stdout: stdout || result.stdout || '',
    stderr: stderr || result.stderr || '',
    exitCode: result.exitCode || 0,
    screenshots,
  })
}

/**
 * Commit changes in the sandbox
 */
async function handleCommit(sandboxId: string, message?: string) {
  if (!sandboxId) {
    return NextResponse.json(
      { error: 'sandboxId is required' },
      { status: 400 }
    )
  }

  // Find sandbox entry
  let sandboxEntry: (typeof activeSandboxes extends Map<string, infer V> ? V : never) | undefined = undefined

  for (const [key, entry] of activeSandboxes.entries()) {
    if (entry.sandboxId === sandboxId) {
      sandboxEntry = entry
      break
    }
  }

  if (!sandboxEntry) {
    return NextResponse.json(
      { error: 'Sandbox not found' },
      { status: 404 }
    )
  }

  if (!sandboxEntry.repo?.cloned) {
    return NextResponse.json(
      { error: 'No repo cloned in this sandbox' },
      { status: 400 }
    )
  }

  const { sandbox } = sandboxEntry
  sandboxEntry.lastActivity = new Date()

  const commitMessage = message || 'Changes by PiPilot Agent'
  const workDir = sandboxEntry.workDir || PROJECT_BASE_DIR

  // Add all changes and commit
  const result = await sandbox.commands.run(
    `cd ${workDir} && git add -A && git commit -m "${commitMessage.replace(/"/g, '\\"')}"`,
    { timeoutMs: 30000 }
  )

  return NextResponse.json({
    success: result.exitCode === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.exitCode || 0,
    message: result.exitCode === 0 ? 'Changes committed' : 'Commit failed',
  })
}

/**
 * Push changes to remote
 */
async function handlePush(request: NextRequest, sandboxId: string) {
  if (!sandboxId) {
    return NextResponse.json(
      { error: 'sandboxId is required' },
      { status: 400 }
    )
  }

  // Find sandbox entry
  let sandboxEntry: (typeof activeSandboxes extends Map<string, infer V> ? V : never) | undefined = undefined

  for (const [key, entry] of activeSandboxes.entries()) {
    if (entry.sandboxId === sandboxId) {
      sandboxEntry = entry
      break
    }
  }

  if (!sandboxEntry) {
    return NextResponse.json(
      { error: 'Sandbox not found' },
      { status: 404 }
    )
  }

  if (!sandboxEntry.repo?.cloned) {
    return NextResponse.json(
      { error: 'No repo cloned in this sandbox' },
      { status: 400 }
    )
  }

  const { sandbox, repo } = sandboxEntry
  sandboxEntry.lastActivity = new Date()
  const workDir = sandboxEntry.workDir || PROJECT_BASE_DIR

  // Push to the same branch
  const result = await sandbox.commands.run(
    `cd ${workDir} && git push origin ${repo.branch}`,
    { timeoutMs: 60000 }
  )

  return NextResponse.json({
    success: result.exitCode === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.exitCode || 0,
    message: result.exitCode === 0 ? 'Changes pushed to remote' : 'Push failed',
  })
}

/**
 * Get git diff stats
 */
async function handleDiff(sandboxId: string) {
  if (!sandboxId) {
    return NextResponse.json(
      { error: 'sandboxId is required' },
      { status: 400 }
    )
  }

  // Find sandbox entry
  let sandboxEntry: (typeof activeSandboxes extends Map<string, infer V> ? V : never) | undefined = undefined

  for (const [key, entry] of activeSandboxes.entries()) {
    if (entry.sandboxId === sandboxId) {
      sandboxEntry = entry
      break
    }
  }

  if (!sandboxEntry) {
    return NextResponse.json(
      { error: 'Sandbox not found' },
      { status: 404 }
    )
  }

  if (!sandboxEntry.repo?.cloned) {
    return NextResponse.json({
      success: true,
      additions: 0,
      deletions: 0,
      changedFiles: 0,
      files: [],
    })
  }

  const { sandbox } = sandboxEntry
  sandboxEntry.lastActivity = new Date()
  const workDir = sandboxEntry.workDir || PROJECT_BASE_DIR

  // Get diff stats
  const statsResult = await sandbox.commands.run(
    `cd ${workDir} && git diff --shortstat`,
    { timeoutMs: 5000 }
  )

  // Get changed files
  const filesResult = await sandbox.commands.run(
    `cd ${workDir} && git diff --name-only`,
    { timeoutMs: 5000 }
  )

  let additions = 0
  let deletions = 0
  let changedFiles = 0

  const statsMatch = statsResult.stdout?.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/)
  if (statsMatch) {
    changedFiles = parseInt(statsMatch[1]) || 0
    additions = parseInt(statsMatch[2]) || 0
    deletions = parseInt(statsMatch[3]) || 0
  }

  const files = filesResult.stdout?.split('\n').filter(Boolean) || []

  return NextResponse.json({
    success: true,
    additions,
    deletions,
    changedFiles,
    files,
  })
}

/**
 * Terminate a sandbox
 */
async function handleTerminate(sandboxId: string) {
  if (!sandboxId) {
    return NextResponse.json(
      { error: 'sandboxId is required' },
      { status: 400 }
    )
  }

  // Find and remove sandbox entry
  let entryKey: string | undefined

  for (const [key, entry] of activeSandboxes.entries()) {
    if (entry.sandboxId === sandboxId) {
      entryKey = key
      break
    }
  }

  if (!entryKey) {
    // Try to kill it directly in E2B
    try {
      const sandbox = await Sandbox.connect(sandboxId)
      await sandbox.kill()
      console.log(`[Agent Cloud] Sandbox terminated via E2B: ${sandboxId}`)
      return NextResponse.json({
        success: true,
        message: 'Sandbox terminated successfully',
      })
    } catch (error) {
      return NextResponse.json(
        { error: 'Sandbox not found' },
        { status: 404 }
      )
    }
  }

  const entry = activeSandboxes.get(entryKey)!

  try {
    await entry.sandbox.kill()
    activeSandboxes.delete(entryKey)
    console.log(`[Agent Cloud] Sandbox terminated: ${sandboxId}`)

    return NextResponse.json({
      success: true,
      message: 'Sandbox terminated successfully',
    })
  } catch (error) {
    activeSandboxes.delete(entryKey)
    return NextResponse.json(
      { error: `Failed to terminate sandbox: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    )
  }
}

/**
 * Get sandbox status
 */
async function handleStatus(sandboxId: string) {
  if (!sandboxId) {
    // Return all active sandboxes
    const sandboxes = Array.from(activeSandboxes.entries()).map(([id, entry]) => ({
      key: id,
      sandboxId: entry.sandboxId,
      createdAt: entry.createdAt.toISOString(),
      lastActivity: entry.lastActivity.toISOString(),
      age: Date.now() - entry.createdAt.getTime(),
      repo: entry.repo,
      messageCount: entry.conversationHistory.length,
      userId: entry.userId
    }))

    return NextResponse.json({
      success: true,
      count: sandboxes.length,
      sandboxes,
    })
  }

  // Find sandbox entry
  let sandboxEntry: (typeof activeSandboxes extends Map<string, infer V> ? V : never) | undefined = undefined

  for (const [key, entry] of activeSandboxes.entries()) {
    if (entry.sandboxId === sandboxId) {
      sandboxEntry = entry
      break
    }
  }

  if (!sandboxEntry) {
    return NextResponse.json(
      { error: 'Sandbox not found' },
      { status: 404 }
    )
  }

  return NextResponse.json({
    success: true,
    sandboxId,
    createdAt: sandboxEntry.createdAt.toISOString(),
    lastActivity: sandboxEntry.lastActivity.toISOString(),
    age: Date.now() - sandboxEntry.createdAt.getTime(),
    repo: sandboxEntry.repo,
    messageCount: sandboxEntry.conversationHistory.length,
  })
}

/**
 * List all sandboxes for current user (from E2B)
 */
async function handleList(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    )
  }

  try {
    const paginator = Sandbox.list({
      query: {
        state: ['running'],
        metadata: { userId: user.id }
      }
    })
    const sandboxes = await paginator.nextItems()

    return NextResponse.json({
      success: true,
      count: sandboxes.length,
      sandboxes: sandboxes.map(s => ({
        sandboxId: s.sandboxId,
        startedAt: s.startedAt,
        metadata: s.metadata
      }))
    })
  } catch (error) {
    console.error('[Agent Cloud] Failed to list sandboxes:', error)
    return NextResponse.json({
      success: true,
      count: 0,
      sandboxes: []
    })
  }
}

/**
/**
 * Restore conversation history to a sandbox
 * Used when recreating a sandbox after expiration
 */
async function handleRestore(
  sandboxId: string,
  conversationHistory: Array<{ role: 'user' | 'assistant', content: string, timestamp?: Date }>
) {
  if (!sandboxId || !conversationHistory) {
    return NextResponse.json(
      { error: 'sandboxId and conversationHistory are required' },
      { status: 400 }
    )
  }

  // Find sandbox entry
  let sandboxEntry: (typeof activeSandboxes extends Map<string, infer V> ? V : never) | undefined = undefined

  for (const [key, entry] of activeSandboxes.entries()) {
    if (entry.sandboxId === sandboxId) {
      sandboxEntry = entry
      break
    }
  }

  if (!sandboxEntry) {
    return NextResponse.json(
      { error: 'Sandbox not found' },
      { status: 404 }
    )
  }

  const { sandbox } = sandboxEntry
  sandboxEntry.lastActivity = new Date()

  // Merge conversation history (add timestamps if missing)
  const formattedHistory = conversationHistory.map(msg => ({
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp || new Date()
  }))

  // Add to sandbox entry
  sandboxEntry.conversationHistory = formattedHistory

  // Write to sandbox filesystem for persistence
  try {
    await sandbox.files.write(
      HISTORY_FILE,
      JSON.stringify(formattedHistory, null, 2)
    )
    console.log(`[Agent Cloud] Restored ${formattedHistory.length} messages to sandbox ${sandboxId}`)
  } catch (e) {
    console.warn('[Agent Cloud] Failed to write conversation history:', e)
  }

  return NextResponse.json({
    success: true,
    messageCount: formattedHistory.length,
    message: `Restored ${formattedHistory.length} messages to sandbox`
  })
}

/**
 * Start a direct streaming server inside the E2B sandbox
 * This allows clients to connect directly to E2B, bypassing Vercel's timeout
 *
 * Returns the public URL that clients can connect to for streaming
 */
async function handleStartStreamServer(request: NextRequest, sandboxId: string) {
  if (!sandboxId) {
    return NextResponse.json(
      { error: 'sandboxId is required' },
      { status: 400 }
    )
  }

  // Get Bonsai API key (round-robin rotation for load distribution)
  const aiGatewayKey = getNextBonsaiKey()
  if (!aiGatewayKey) {
    return NextResponse.json(
      { error: 'BONSAI_API_KEY not configured' },
      { status: 500 }
    )
  }

  // Find sandbox entry
  let sandboxEntry: (typeof activeSandboxes extends Map<string, infer V> ? V : never) | undefined = undefined

  for (const [key, entry] of activeSandboxes.entries()) {
    if (entry.sandboxId === sandboxId) {
      sandboxEntry = entry
      break
    }
  }

  if (!sandboxEntry) {
    // Try to reconnect
    try {
      console.log(`[Agent Cloud] Attempting to reconnect to sandbox: ${sandboxId}`)
      const sandbox = await Sandbox.connect(sandboxId)
      sandboxEntry = {
        sandboxId,
        sandbox,
        createdAt: new Date(),
        lastActivity: new Date(),
        userId: 'reconnected',
        conversationHistory: []
      }
    } catch (error) {
      return NextResponse.json(
        { error: 'Sandbox not found or expired' },
        { status: 404 }
      )
    }
  }

  const { sandbox } = sandboxEntry
  const workDir = sandboxEntry.workDir || '/home/user'
  const workingBranch = sandboxEntry.workingBranch || 'main'
  const STREAM_SERVER_PORT = 3001

  // Create the streaming server script
  const streamServerScript = `#!/usr/bin/env node
import express from 'express';
import cors from 'cors';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const HISTORY_FILE = '${HISTORY_FILE}';
const WORK_DIR = '${workDir}';
const WORKING_BRANCH = '${workingBranch}';

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Main streaming endpoint
app.post('/stream', async (req, res) => {
  const { prompt, images = [], systemPrompt: customSystemPrompt } = req.body;

  if (!prompt && images.length === 0) {
    return res.status(400).json({ error: 'prompt or images required' });
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const send = (payload) => {
    res.write('data: ' + JSON.stringify(payload) + '\\n\\n');
  };

  try {
    send({ type: 'start', timestamp: Date.now() });
    send({ type: 'log', message: 'Claude is thinking...' });

    // Build conversation history
    let conversationHistory = [];
    try {
      if (existsSync(HISTORY_FILE)) {
        conversationHistory = JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'));
      }
    } catch (e) {}

    // Add user message to history
    conversationHistory.push({ role: 'user', content: prompt, timestamp: new Date().toISOString() });

    const MAX_PAIRS = 6;
    const MAX_MSG_LENGTH = 800;
    const recentHistory = conversationHistory.slice(-(MAX_PAIRS * 2));

    let fullPrompt = prompt;
    if (recentHistory.length > 2) {
      const context = recentHistory.slice(0, -1)
        .map(msg => {
          const content = msg.content.length > MAX_MSG_LENGTH
            ? msg.content.slice(0, MAX_MSG_LENGTH) + '...[truncated]'
            : msg.content;
          return (msg.role === 'user' ? 'Human' : 'Assistant') + ': ' + content;
        })
        .join('\\n\\n');
      fullPrompt = 'Previous conversation:\\n' + context + '\\n\\nCurrent request: ' + prompt;
    }

    // Git workflow system prompt with working directory
    const gitWorkflowPrompt = customSystemPrompt || \`
CRITICAL PROJECT DIRECTORY INFORMATION:
- PROJECT PATH: \${WORK_DIR}
- This is where ALL project source code is located
- ALWAYS cd to \${WORK_DIR} before running ANY commands (builds, installs, git, etc.)
- NEVER run npm/pnpm install or create files in /home/user directly - that is the system directory
- System tools and SDK are installed in /home/user (DO NOT modify this)
- Your project files are ONLY in: \${WORK_DIR}

IMPORTANT GIT WORKFLOW INSTRUCTIONS:
- You are working on branch: \${WORKING_BRANCH}
- BEFORE committing, ALWAYS configure git user: git config user.name "pipilot-swe-bot" && git config user.email "hello@pipilot.dev"

INCREMENTAL COMMIT & PUSH (CRITICAL - prevents work loss):
- Do NOT wait until you finish everything to commit. Commit and push INCREMENTALLY as you build.
- After completing each meaningful unit of work (e.g. a new component, a feature, a config change, a bug fix), immediately:
  1. git add the relevant files
  2. git commit -m "descriptive message of what was done"
  3. git push -u origin \${WORKING_BRANCH}
- Examples of when to commit & push:
  - After initial project setup / scaffolding
  - After adding each new component or page
  - After installing and configuring dependencies
  - After implementing each feature or fixing each bug
  - After adding styles or updating layouts
  - Before starting a risky or complex change
- This protects the user's work if the session disconnects, credits run out, or the sandbox closes.
- The user can always recover from the last pushed commit on reconnection.
- A .gitignore file exists in the project to prevent committing node_modules and other artifacts
\`.trim();

    // Configure MCP servers
    const mcpServers = {};
    if (process.env.MCP_GATEWAY_URL) {
      mcpServers['tavily'] = { type: 'http', url: process.env.MCP_GATEWAY_URL };
    }
    if (process.env.GITHUB_TOKEN) {
      mcpServers['github'] = {
        type: 'http',
        url: 'https://api.githubcopilot.com/mcp',
        headers: { 'Authorization': 'Bearer ' + process.env.GITHUB_TOKEN }
      };
    }
    mcpServers['playwright'] = { command: 'npx', args: ['@playwright/mcp@latest'] };

    // Build prompt input
    let promptInput;
    if (images.length > 0) {
      const gen = async function*() {
        const contentParts = [];
        for (const img of images) {
          contentParts.push({
            type: 'image',
            source: { type: 'base64', media_type: img.type || 'image/png', data: img.data }
          });
        }
        contentParts.push({ type: 'text', text: fullPrompt });
        yield { type: 'user', message: { role: 'user', content: contentParts } };
      };
      promptInput = gen();
    } else {
      promptInput = fullPrompt;
    }

    let textContent = '';
    let hasStreamedText = false;

    // Start heartbeat
    const heartbeat = setInterval(() => {
      send({ type: 'heartbeat', timestamp: Date.now() });
    }, 15000);

    try {
      for await (const message of query({
        prompt: promptInput,
        options: {
          systemPrompt: gitWorkflowPrompt,
          includePartialMessages: true,
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
          ...(Object.keys(mcpServers).length > 0 ? {
            mcpServers,
            allowedTools: Object.keys(mcpServers).map(k => 'mcp__' + k + '__*')
          } : {})
        }
      })) {
        if (message.type === 'stream_event') {
          const event = message.event;
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            hasStreamedText = true;
            const cleaned = event.delta.text.replace(/^@bonsai:[^\\n]*\\n?/gm, '');
            if (cleaned) {
              textContent += cleaned;
              send({ type: 'text', data: cleaned, timestamp: Date.now() });
            }
          } else if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
            send({ type: 'tool_use', name: event.content_block.name, input: {}, timestamp: Date.now() });
          }
        } else if (message.type === 'assistant') {
          // Only process tool_use blocks here - text already streamed via stream_event
          const content = message.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'tool_use') {
                send({ type: 'tool_use', name: block.name, input: block.input, timestamp: Date.now() });
              }
            }
          }
          // Reset for next turn (multi-turn conversations)
          hasStreamedText = false;
        } else if (message.type === 'user') {
          const content = message.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'tool_result') {
                let resultContent = '';
                if (Array.isArray(block.content)) {
                  resultContent = block.content.map(c => c.type === 'text' ? c.text : '[' + c.type + ']').join('\\n');
                } else {
                  resultContent = String(block.content);
                }
                send({ type: 'tool_result', result: resultContent.substring(0, 2000), timestamp: Date.now() });
              }
            }
          }
        } else if (message.type === 'result') {
          send({ type: 'result', subtype: message.subtype, result: message.result, cost: message.total_cost_usd, timestamp: Date.now() });
        }
      }

      // Save to conversation history
      conversationHistory.push({ role: 'assistant', content: textContent, timestamp: new Date().toISOString() });
      try {
        writeFileSync(HISTORY_FILE, JSON.stringify(conversationHistory, null, 2));
      } catch (e) {}

      // Get git diff stats
      let diffStats = { additions: 0, deletions: 0, filesChanged: 0 };
      try {
        const { execSync } = await import('child_process');
        const diffOutput = execSync('git diff --shortstat HEAD~1 2>/dev/null || echo "0 0 0"', { cwd: WORK_DIR, encoding: 'utf-8' });
        const match = diffOutput.match(/(\\d+) files? changed(?:, (\\d+) insertions?\\(\\+\\))?(?:, (\\d+) deletions?\\(-\\))?/);
        if (match) {
          diffStats = {
            filesChanged: parseInt(match[1]) || 0,
            additions: parseInt(match[2]) || 0,
            deletions: parseInt(match[3]) || 0
          };
        }
      } catch (e) {}

      send({ type: 'complete', diff: diffStats, timestamp: Date.now() });
    } finally {
      clearInterval(heartbeat);
    }

    res.end();
  } catch (error) {
    send({ type: 'error', message: error.message || String(error), timestamp: Date.now() });
    res.end();
  }
});

const PORT = ${STREAM_SERVER_PORT};
app.listen(PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({ type: 'server_ready', port: PORT, timestamp: Date.now() }));
});
`

  try {
    // Upload the streaming server script to SYSTEM_DIR (not project dir)
    await sandbox.files.write(`${SYSTEM_DIR}/stream-server.mjs`, streamServerScript)
    console.log(`[Agent Cloud] Stream server script uploaded to ${SYSTEM_DIR}`)

    // Install dependencies in SYSTEM_DIR to avoid polluting project
    const installCommand = `cd ${SYSTEM_DIR} && ([ -f package.json ] || echo '{"type":"module"}' > package.json) && pnpm add express cors @anthropic-ai/claude-agent-sdk 2>&1`

    console.log(`[Agent Cloud] Installing stream server dependencies in ${SYSTEM_DIR}...`)
    await sandbox.commands.run(installCommand, {
      cwd: SYSTEM_DIR,
      timeoutMs: 0 // No timeout for pnpm install
    })

    // Start the server in background with environment variables
    const startCommand = `cd ${SYSTEM_DIR} && nohup node stream-server.mjs > /tmp/stream-server.log 2>&1 &`

    await sandbox.commands.run(startCommand, {
      cwd: SYSTEM_DIR,
      timeoutMs: 10000,
      envs: {
        ANTHROPIC_BASE_URL: AI_GATEWAY_BASE_URL,
        ANTHROPIC_AUTH_TOKEN: aiGatewayKey,
        ANTHROPIC_API_KEY: '',
        // Selected model goes into sonnet slot (Claude Code's default tier)
        ANTHROPIC_DEFAULT_SONNET_MODEL: AVAILABLE_MODELS[(sandboxEntry.model as keyof typeof AVAILABLE_MODELS) || 'sonnet'] || AVAILABLE_MODELS.sonnet,
        ANTHROPIC_DEFAULT_OPUS_MODEL: AVAILABLE_MODELS.opus,
        ANTHROPIC_DEFAULT_HAIKU_MODEL: AVAILABLE_MODELS.haiku,
        PLAYWRIGHT_BROWSERS_PATH: '0',
        ...(sandboxEntry.mcpGatewayUrl ? { MCP_GATEWAY_URL: sandboxEntry.mcpGatewayUrl } : {}),
      }
    })

    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Get the public URL for the streaming port
    let streamUrl: string
    try {
      if (typeof sandbox.getHost === 'function') {
        streamUrl = `https://${sandbox.getHost(STREAM_SERVER_PORT)}`
      } else {
        // Fallback URL construction
        streamUrl = `https://${sandboxId}-${STREAM_SERVER_PORT}.e2b.dev`
      }
    } catch (e) {
      streamUrl = `https://${sandboxId}-${STREAM_SERVER_PORT}.e2b.dev`
    }

    console.log(`[Agent Cloud] Stream server started at: ${streamUrl}`)

    return NextResponse.json({
      success: true,
      streamUrl,
      port: STREAM_SERVER_PORT,
      message: 'Stream server started. Connect directly to streamUrl for streaming.'
    })

  } catch (error) {
    console.error('[Agent Cloud] Failed to start stream server:', error)
    return NextResponse.json(
      { error: `Failed to start stream server: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    )
  }
}

/**
 * Handle direct stream request (used internally by the E2B stream server)
 * This is a quick action that returns connection info without starting a new server
 */
async function handleDirectStream(sandboxId: string, prompt: string, images: Array<{ data: string; type: string }>) {
  // Find sandbox to get its stream URL
  let sandboxEntry: (typeof activeSandboxes extends Map<string, infer V> ? V : never) | undefined = undefined

  for (const [key, entry] of activeSandboxes.entries()) {
    if (entry.sandboxId === sandboxId) {
      sandboxEntry = entry
      break
    }
  }

  if (!sandboxEntry) {
    return NextResponse.json(
      { error: 'Sandbox not found. Call start-stream-server first.' },
      { status: 404 }
    )
  }

  const STREAM_SERVER_PORT = 3001
  let streamUrl: string

  try {
    const { sandbox } = sandboxEntry
    if (typeof sandbox.getHost === 'function') {
      streamUrl = `https://${sandbox.getHost(STREAM_SERVER_PORT)}`
    } else {
      streamUrl = `https://${sandboxId}-${STREAM_SERVER_PORT}.e2b.dev`
    }
  } catch (e) {
    streamUrl = `https://${sandboxId}-${STREAM_SERVER_PORT}.e2b.dev`
  }

  return NextResponse.json({
    success: true,
    streamUrl,
    port: STREAM_SERVER_PORT,
    sandboxId,
    message: 'POST to streamUrl/stream with { prompt, images } to start streaming directly from E2B'
  })
}

/**
 * Cleanup inactive sandboxes
 */
function cleanupInactiveSandboxes() {
  const now = Date.now()
  for (const [key, entry] of activeSandboxes.entries()) {
    if (now - entry.lastActivity.getTime() > SANDBOX_TIMEOUT) {
      console.log(`[Agent Cloud] Cleaning up inactive sandbox: ${entry.sandboxId}`)
      entry.sandbox.kill().catch(console.error)
      activeSandboxes.delete(key)
    }
  }
}

// Cleanup on module unload
if (typeof process !== 'undefined') {
  process.on('beforeExit', () => {
    for (const [key, entry] of activeSandboxes.entries()) {
      console.log(`[Agent Cloud] Cleaning up sandbox on exit: ${entry.sandboxId}`)
      entry.sandbox.kill().catch(console.error)
    }
  })
}
