/**
 * PiPilot Agent Template
 *
 * A combined E2B sandbox template that includes:
 * - Claude Code CLI (@anthropic-ai/claude-agent-sdk)
 * - Playwright with Chromium for browser automation
 * - Vercel AI Gateway for unified AI routing
 *
 * This enables autonomous coding agents that can:
 * 1. Write and modify code using Claude Code
 * 2. Test UIs and flows using Playwright
 * 3. Route API calls through Vercel AI Gateway
 * 4. Use any model available through AI Gateway
 */

import { Sandbox } from 'e2b'

// Template configuration
export const PIPILOT_AGENT_TEMPLATE = 'pipilot-agent'

// Vercel AI Gateway configuration
export const AI_GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh'

// Available models through Vercel AI Gateway
export const AVAILABLE_MODELS = {
  sonnet: 'xai/grok-code-fast-1',      // Fast code generation
  opus: 'ollama/nemotron-3-super',       // High quality
  haiku: 'mistral/devstral-small-2',   // Quick tasks
} as const

export type ModelType = keyof typeof AVAILABLE_MODELS

// Template definition for building custom E2B template
// Use this with `e2b template build` or Template.build()
export const templateDefinition = {
  name: PIPILOT_AGENT_TEMPLATE,
  description: 'PiPilot Agent Cloud - Claude Code + Playwright sandbox',

  // Template specification using E2B SDK fluent API pattern
  // Start from node:20-slim (required for Playwright compatibility)
  baseImage: 'node:20-slim',

  // Build steps
  steps: [
    // Set root user for installation
    { type: 'setUser', user: 'root' },

    // Install system dependencies for Playwright
    { type: 'run', command: 'apt-get update' },
    { type: 'run', command: 'apt-get install -y curl git' },

    // Setup Playwright in /app directory
    { type: 'setWorkdir', path: '/app' },
    { type: 'run', command: 'npm init -y' },
    { type: 'npmInstall', packages: ['playwright'] },
    { type: 'run', command: 'PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install --with-deps chromium' },
    { type: 'run', command: 'chmod a+rwX /app' },

    // Install Claude Code globally
    { type: 'npmInstall', packages: ['@anthropic-ai/claude-agent-sdk'], global: true },

    // Setup user environment
    { type: 'setUser', user: 'user' },
    { type: 'setWorkdir', path: '/home/user' },
  ]
}

// Environment variables for Vercel AI Gateway
export interface AgentCloudConfig {
  // Vercel AI Gateway API key (required)
  aiGatewayKey: string
  // Model to use (default: sonnet)
  model?: ModelType
  // Sandbox timeout in milliseconds (default: 5 minutes)
  timeoutMs?: number
}

/**
 * Create a PiPilot Agent Cloud sandbox
 *
 * This creates an E2B sandbox with Claude Code and Playwright pre-installed.
 * Configured with Vercel AI Gateway for unified AI routing.
 */
export async function createAgentCloudSandbox(config: AgentCloudConfig): Promise<{
  sandbox: Sandbox
  sandboxId: string
  model: string
  gateway: string
  runClaudeCode: (prompt: string, options?: ClaudeCodeOptions) => Promise<ClaudeCodeResult>
  runPlaywright: (script: string) => Promise<PlaywrightResult>
  terminate: () => Promise<void>
}> {
  const selectedModel = config.model || 'sonnet'

  // Configure environment variables for Claude Code with Vercel AI Gateway
  // IMPORTANT: ANTHROPIC_API_KEY must be empty string so Claude Code uses ANTHROPIC_AUTH_TOKEN
  const envs: Record<string, string> = {
    // Vercel AI Gateway configuration
    ANTHROPIC_BASE_URL: AI_GATEWAY_BASE_URL,
    ANTHROPIC_AUTH_TOKEN: config.aiGatewayKey,
    ANTHROPIC_API_KEY: '', // Must be empty - Claude Code checks this first

    // Model overrides via AI Gateway
    ANTHROPIC_DEFAULT_SONNET_MODEL: AVAILABLE_MODELS.sonnet,
    ANTHROPIC_DEFAULT_OPUS_MODEL: AVAILABLE_MODELS.opus,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: AVAILABLE_MODELS.haiku,

    // Playwright configuration
    PLAYWRIGHT_BROWSERS_PATH: '0',
  }

  // Create sandbox with the pipilot-agent template
  // Note: Template must be built first with `e2b template build`
  // For now, fall back to anthropic-claude-code template
  const templateToUse = await checkTemplateExists(PIPILOT_AGENT_TEMPLATE)
    ? PIPILOT_AGENT_TEMPLATE
    : 'anthropic-claude-code'

  console.log(`[Agent Cloud] Creating sandbox with template: ${templateToUse}`)
  console.log(`[Agent Cloud] Using Vercel AI Gateway: ${AI_GATEWAY_BASE_URL}`)
  console.log(`[Agent Cloud] Default model: ${AVAILABLE_MODELS[selectedModel]}`)

  const sandbox = await Sandbox.create(templateToUse, {
    timeoutMs: config.timeoutMs || 5 * 60 * 1000, // 5 minutes default
    envs,
  })

  console.log(`[Agent Cloud] Sandbox created: ${sandbox.sandboxId}`)

  return {
    sandbox,
    sandboxId: sandbox.sandboxId,
    model: AVAILABLE_MODELS[selectedModel],
    gateway: AI_GATEWAY_BASE_URL,

    /**
     * Run a prompt with Claude Code
     */
    runClaudeCode: async (prompt: string, options?: ClaudeCodeOptions) => {
      return executeClaudeCode(sandbox, prompt, options)
    },

    /**
     * Run a Playwright script for browser automation
     */
    runPlaywright: async (script: string) => {
      return executePlaywrightScript(sandbox, script)
    },

    /**
     * Terminate the sandbox
     */
    terminate: async () => {
      await sandbox.kill()
      console.log(`[Agent Cloud] Sandbox terminated: ${sandbox.sandboxId}`)
    }
  }
}

export interface ClaudeCodeOptions {
  // Working directory for Claude Code
  workingDirectory?: string
  // Allow Claude Code to make changes without confirmation
  dangerouslySkipPermissions?: boolean
  // Timeout for Claude Code execution (0 = no timeout)
  timeoutMs?: number
  // Callback for stdout streaming
  onStdout?: (data: string) => void
  // Callback for stderr streaming
  onStderr?: (data: string) => void
}

export interface ClaudeCodeResult {
  stdout: string
  stderr: string
  exitCode: number
  // Files created/modified by Claude Code
  files?: string[]
}

/**
 * Execute Claude Code with a prompt
 */
async function executeClaudeCode(
  sandbox: Sandbox,
  prompt: string,
  options?: ClaudeCodeOptions
): Promise<ClaudeCodeResult> {
  const workDir = options?.workingDirectory || '/home/user'
  const skipPermissions = options?.dangerouslySkipPermissions ?? true

  // Build the claude command
  // Using pipe to pass prompt to claude CLI
  const escapedPrompt = prompt.replace(/'/g, "'\\''") // Escape single quotes
  const claudeFlags = skipPermissions ? '-p --dangerously-skip-permissions' : '-p'
  const command = `cd ${workDir} && echo '${escapedPrompt}' | claude ${claudeFlags}`

  console.log(`[Agent Cloud] Running Claude Code in ${workDir}`)

  let stdout = ''
  let stderr = ''

  const result = await sandbox.commands.run(command, {
    timeoutMs: options?.timeoutMs || 0, // No timeout by default
    onStdout: (data) => {
      stdout += data
      options?.onStdout?.(data)
    },
    onStderr: (data) => {
      stderr += data
      options?.onStderr?.(data)
    }
  })

  // List files that may have been created/modified
  const filesResult = await sandbox.commands.run(`find ${workDir} -type f -mmin -5 2>/dev/null | head -50`, {
    timeoutMs: 10000
  })
  const files = filesResult.stdout?.split('\n').filter(Boolean) || []

  return {
    stdout: stdout || result.stdout || '',
    stderr: stderr || result.stderr || '',
    exitCode: result.exitCode || 0,
    files
  }
}

export interface PlaywrightResult {
  stdout: string
  stderr: string
  exitCode: number
  // Screenshots captured during execution
  screenshots?: Array<{ name: string, path: string }>
}

/**
 * Execute a Playwright script for browser automation
 */
async function executePlaywrightScript(
  sandbox: Sandbox,
  script: string
): Promise<PlaywrightResult> {
  // Write the script to the sandbox
  const scriptPath = '/app/agent-script.mjs'
  await sandbox.files.write(scriptPath, script)

  console.log(`[Agent Cloud] Running Playwright script`)

  let stdout = ''
  let stderr = ''

  // Run the script from /app directory where Playwright is installed
  const result = await sandbox.commands.run(
    `PLAYWRIGHT_BROWSERS_PATH=0 node ${scriptPath}`,
    {
      cwd: '/app',
      onStdout: (data) => {
        stdout += data
        console.log(`[Playwright] ${data}`)
      },
      onStderr: (data) => {
        stderr += data
        console.error(`[Playwright Error] ${data}`)
      }
    }
  )

  // Find any screenshots created
  const screenshotsResult = await sandbox.commands.run(
    'find /home/user -name "*.png" -mmin -5 2>/dev/null',
    { timeoutMs: 5000 }
  )
  const screenshotPaths = screenshotsResult.stdout?.split('\n').filter(Boolean) || []
  const screenshots = screenshotPaths.map(path => ({
    name: path.split('/').pop() || 'screenshot.png',
    path
  }))

  return {
    stdout: stdout || result.stdout || '',
    stderr: stderr || result.stderr || '',
    exitCode: result.exitCode || 0,
    screenshots
  }
}

/**
 * Check if a custom E2B template exists
 */
async function checkTemplateExists(templateName: string): Promise<boolean> {
  try {
    // Try to get template info - if it fails, template doesn't exist
    // For now, return false to use fallback template
    // In production, implement actual template check via E2B API
    console.log(`[Agent Cloud] Checking for template: ${templateName}`)
    return false
  } catch {
    return false
  }
}

/**
 * Generate a Playwright script from a test description
 * Used by Claude Code to create browser automation tests
 */
export function generatePlaywrightScript(options: {
  url: string
  actions?: Array<{
    type: 'click' | 'fill' | 'navigate' | 'screenshot' | 'wait'
    selector?: string
    value?: string
    path?: string
    duration?: number
  }>
  screenshotPath?: string
}): string {
  const actions = options.actions || []
  const screenshotPath = options.screenshotPath || '/home/user/screenshot.png'

  let scriptLines = [
    `import { chromium } from 'playwright'`,
    '',
    'const browser = await chromium.launch()',
    'const context = await browser.newContext()',
    'const page = await context.newPage()',
    '',
    `await page.goto('${options.url}')`,
  ]

  for (const action of actions) {
    switch (action.type) {
      case 'click':
        scriptLines.push(`await page.click('${action.selector}')`)
        break
      case 'fill':
        scriptLines.push(`await page.fill('${action.selector}', '${action.value}')`)
        break
      case 'navigate':
        scriptLines.push(`await page.goto('${action.value}')`)
        break
      case 'screenshot':
        scriptLines.push(`await page.screenshot({ path: '${action.path || screenshotPath}' })`)
        break
      case 'wait':
        scriptLines.push(`await page.waitForTimeout(${action.duration || 1000})`)
        break
    }
  }

  // Always take a final screenshot if not already done
  const hasScreenshot = actions.some(a => a.type === 'screenshot')
  if (!hasScreenshot) {
    scriptLines.push(`await page.screenshot({ path: '${screenshotPath}' })`)
  }

  scriptLines.push(
    '',
    'await browser.close()',
    '',
    `console.log('done')`
  )

  return scriptLines.join('\n')
}

// Export types for API consumers
export type { Sandbox }
