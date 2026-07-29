import { NextRequest, NextResponse } from 'next/server'
import { streamText, tool, stepCountIs } from 'ai'
import { createMistral } from '@ai-sdk/mistral'
import { z } from 'zod'

// Supabase service client (no cookie-based auth needed for cron)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(supabaseUrl, supabaseServiceKey)
}

// Tavily config for web search/extract tools — keys must come from environment
const tavilyConfig = {
  apiKeys: (process.env.TAVILY_API_KEYS || '').split(',').filter(Boolean),
  currentKeyIndex: 0
}

function getNextTavilyKey(): string {
  if (tavilyConfig.apiKeys.length === 0) {
    throw new Error('TAVILY_API_KEYS environment variable is not set')
  }
  const key = tavilyConfig.apiKeys[tavilyConfig.currentKeyIndex]
  tavilyConfig.currentKeyIndex = (tavilyConfig.currentKeyIndex + 1) % tavilyConfig.apiKeys.length
  return key
}

// AI model for task execution (fast, cheap, good for research)
const mistralProvider = createMistral({
  apiKey: process.env.MISTRAL_API_KEY || '',
})

// ─── Web search via Tavily ───────────────────────────────────────────────────
async function searchWeb(query: string): Promise<string> {
  const apiKey = getNextTavilyKey()
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      query,
      search_depth: 'basic',
      include_answer: false,
      include_raw_content: false,
      max_results: 5
    })
  })

  if (!response.ok) {
    throw new Error(`Web search failed: ${response.status}`)
  }

  const data = await response.json()
  const results = data.results || []

  if (results.length === 0) return `No results found for: "${query}"`

  let text = ''
  for (const r of results.slice(0, 5)) {
    const content = (r.content || '').replace(/\s+/g, ' ').trim().substring(0, 400)
    text += `**${r.title || 'Untitled'}**\n${r.url || ''}\n${content}\n\n`
  }
  return text.substring(0, 3000)
}

// ─── Web extract via Tavily ──────────────────────────────────────────────────
async function extractWebContent(url: string): Promise<string> {
  const apiKey = getNextTavilyKey()
  const response = await fetch('https://api.tavily.com/extract', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      urls: [url],
      include_images: false,
      extract_depth: 'basic'
    })
  })

  if (!response.ok) {
    throw new Error(`Web extraction failed: ${response.status}`)
  }

  const data = await response.json()
  const results = data.results || []
  if (results.length === 0) return `No content extracted from: ${url}`

  const item = results[0]
  const content = (item.text || item.raw_content || '').replace(/\s+/g, ' ').trim()
  return content.substring(0, 4000)
}

// ─── Cron-safe next execution calculator ─────────────────────────────────────
function getNextExecution(cronExpr: string): string {
  const now = new Date()
  const parts = cronExpr.trim().split(/\s+/)
  if (parts.length !== 5) return new Date(now.getTime() + 86400000).toISOString()

  const [min, hour, dom, mon, dow] = parts

  // Every N minutes: */N * * * *
  if (min.startsWith('*/')) {
    const interval = parseInt(min.slice(2)) || 15
    const next = new Date(now)
    next.setSeconds(0, 0)
    next.setMinutes(Math.ceil((next.getMinutes() + 1) / interval) * interval)
    if (next <= now) next.setMinutes(next.getMinutes() + interval)
    return next.toISOString()
  }

  // Every N hours: 0 */N * * *
  if (hour.startsWith('*/')) {
    const interval = parseInt(hour.slice(2)) || 6
    const next = new Date(now)
    next.setMinutes(parseInt(min) || 0, 0, 0)
    next.setHours(Math.ceil((next.getHours() + 1) / interval) * interval)
    if (next <= now) next.setHours(next.getHours() + interval)
    return next.toISOString()
  }

  // Daily at specific time: M H * * *
  if (min !== '*' && hour !== '*' && dom === '*' && mon === '*' && dow === '*') {
    const next = new Date(now)
    next.setHours(parseInt(hour), parseInt(min), 0, 0)
    if (next <= now) next.setDate(next.getDate() + 1)
    return next.toISOString()
  }

  // Weekly: M H * * D
  if (dow !== '*' && dom === '*') {
    const targetDow = parseInt(dow)
    const next = new Date(now)
    next.setHours(parseInt(hour) || 0, parseInt(min) || 0, 0, 0)
    let daysUntil = (targetDow - next.getDay() + 7) % 7
    if (daysUntil === 0 && next <= now) daysUntil = 7
    next.setDate(next.getDate() + daysUntil)
    return next.toISOString()
  }

  // Default: 24 hours from now
  return new Date(now.getTime() + 86400000).toISOString()
}

// ─── Execute a single task ───────────────────────────────────────────────────
async function executeTask(
  task: any,
  executionId: string,
  supabase: any
): Promise<{ output: string; error: string | null }> {
  const prompt = task.config?.prompt
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return { output: '', error: 'Task has no prompt configured. Add a prompt in the task settings.' }
  }

  const model = mistralProvider('mistral-small-latest')

  // Track whether save_result has persisted to DB
  let savedResult: string | null = null

  try {
    const result = streamText({
      model,
      temperature: 0.4,
      system: `You are a research assistant for PiPilot, an AI-powered app builder. You execute scheduled tasks that involve research, information gathering, monitoring, and analysis.

## HEADLESS AUTONOMOUS MODE (CRITICAL)
You are running as an automated scheduled task with NO human user present. There is NO one to respond to follow-up questions. You MUST:
- **NEVER ask follow-up questions** like "Would you like me to...", "Shall I...", "Do you want me to...", "Let me know if..."
- **NEVER present a list of links and ask the user to pick one** - instead, automatically extract content from the most relevant URLs yourself
- **ALWAYS be proactive**: After web_search returns results with URLs, IMMEDIATELY call web_extract on the top 2-3 most relevant URLs to get the actual content
- **ALWAYS deliver complete results**: Your output must contain the actual information/content, NOT just links or summaries of search results
- **Work autonomously from start to finish**: Search -> Extract -> Analyze -> Save. No pausing for input.

## Execution Flow (MANDATORY)
1. Call \`web_search\` with a good query for the task
2. Review the search results - identify the 2-3 most relevant URLs
3. Call \`web_extract\` on those URLs to get the actual page content
4. Synthesize all extracted content into a comprehensive, detailed report
5. Call \`save_result\` with the complete findings

Your capabilities:
- Search the web for current information
- Extract content from web pages
- Analyze and summarize findings
- Provide structured, detailed reports

Rules:
- Always cite sources with URLs when using web search
- If the task asks for monitoring/checking something, clearly state current status
- Do NOT generate code or modify any files - you are research-only
- Complete the task in as few tool calls as possible (max 30)
- NEVER end your work by listing links and asking a question - always extract and present the actual content
- IMPORTANT: When you have finished your research, you MUST call the save_result tool with your complete findings. This is required to save the task output. Never skip calling save_result.
- Current time: ${new Date().toISOString()}

## RESULT FORMATTING (MANDATORY)
Your output saved via save_result MUST be a detailed, well-structured, presentable markdown document. Follow these rules strictly:

### Structure Requirements:
1. **Title**: Start with a clear \`# Title\` heading that describes the research topic or task
2. **Executive Summary**: A brief introductory paragraph (3-5 sentences) summarizing the key findings upfront
3. **Sections**: Organize content into \`## Sections\` and \`### Subsections\` with clear, descriptive headers
4. **Detailed Paragraphs**: Each section MUST contain substantive paragraphs (not just bullet points). Provide context, explanations, and real-world implications. Minimum 2-3 sentences per paragraph.
5. **Tables**: Use markdown tables (\`| Column | Column |\`) whenever comparing features, data points, metrics, options, or any multi-attribute information. Every research result should include at least one table.
6. **Images (MANDATORY)**: You MUST embed at least one illustrative image per result using: \`![Description](https://api.a0.dev/assets/image?text={url-encoded-description}&aspect=16:9)\`. Add images to visually represent the topic, key concepts, or data. Place them after section headings or alongside key findings. Use descriptive text in the URL for relevant visuals (e.g. \`![AI Market Growth](https://api.a0.dev/assets/image?text=artificial+intelligence+market+growth+chart&aspect=16:9)\`). For multiple topics, embed 2-3 images throughout the document.
7. **Bullet & Numbered Lists**: Use bullet points for features/items and numbered lists for sequential steps, rankings, or priorities
8. **Blockquotes**: Use \`>\` blockquotes for key takeaways, important warnings, or notable quotes from sources
9. **Bold & Emphasis**: Use **bold** for key terms, metrics, and important data points. Use *italics* for definitions or emphasis.
10. **Horizontal Rules**: Use \`---\` to separate major sections for visual clarity

### Content Depth:
- **Minimum 400 words** for any task result
- Include specific data points, numbers, statistics, dates, and facts - never be vague
- For comparisons: MUST include a comparison table with clear columns
- For monitoring tasks: include a status table with current values and any changes detected
- For research tasks: minimum 4 sections with detailed analysis

### Mandatory Sections:
- \`# [Task Title]\` - Clear, descriptive title
- \`> **Summary:** [1-2 sentence executive summary]\`
- At least one \`![image](url)\` embedded image
- Main content sections with \`##\` headings
- At least one markdown table with relevant data
- \`## Key Takeaways\` - Bulleted list of the most important findings
- \`## Sources\` - List all web sources used as \`- [Source Title](URL)\`

### Example Structure:
\`\`\`
# [Research Topic]

> **Summary:** [Brief executive summary of findings...]

![Topic Overview](https://api.a0.dev/assets/image?text=topic+overview+illustration&aspect=16:9)

---

## Overview
[Detailed contextual paragraph...]

## Key Findings

### [Finding 1]
[Detailed paragraph with data points...]

| Metric | Value | Change |
|--------|-------|--------|
| ...    | ...   | ...    |

![Finding Visualization](https://api.a0.dev/assets/image?text=data+visualization+chart&aspect=16:9)

### [Finding 2]
[Detailed paragraph...]

> **Important:** [Key takeaway in blockquote]

## Analysis
[Deep analysis paragraphs...]

## Key Takeaways
- [Takeaway 1]
- [Takeaway 2]
- [Takeaway 3]

## Sources
- [Source 1](url)
- [Source 2](url)
\`\`\``,
      messages: [
        { role: 'user', content: prompt }
      ],
      tools: {
        web_search: tool({
          description: 'Search the web for current information. Use this for research, news, documentation lookup, status checks, etc.',
          parameters: z.object({
            query: z.string().describe('Search query')
          }),
          execute: async ({ query }) => {
            return await searchWeb(query)
          }
        }),
        web_extract: tool({
          description: 'Extract and read content from a specific web page URL.',
          parameters: z.object({
            url: z.string().url().describe('URL to extract content from')
          }),
          execute: async ({ url }) => {
            return await extractWebContent(url)
          }
        }),
        save_result: tool({
          description: 'Save the final task result. You MUST call this tool at the end of every task with your complete findings as a rich, detailed markdown document. This is how the results get stored and displayed to the user. The result must include: a # title, executive summary blockquote, embedded ![images](url), ## sections with detailed paragraphs, at least one markdown table, ## Key Takeaways, and ## Sources.',
          parameters: z.object({
            result: z.string().describe('The complete task result as a detailed markdown document. MUST include: # Title, > Summary blockquote, at least one ![image](https://api.a0.dev/assets/image?text=description&aspect=16:9), ## sections with paragraphs (not just bullets), at least one | table |, ## Key Takeaways, and ## Sources with [Name](URL) links. Minimum 400 words.')
          }),
          execute: async ({ result: markdown }) => {
            // Save directly to DB so the result persists even if the function times out later
            const trimmed = markdown.substring(0, 10000)
            const { error } = await supabase
              .from('task_executions')
              .update({
                output: trimmed,
                status: 'completed',
                completed_at: new Date().toISOString(),
              })
              .eq('id', executionId)

            if (error) {
              console.error(`[ScheduledTasks] save_result DB write failed for execution ${executionId}:`, error)
              // Still keep in memory as fallback
              savedResult = trimmed
              return 'Result captured in memory (DB write failed).'
            }

            savedResult = trimmed
            console.log(`[ScheduledTasks] save_result wrote ${trimmed.length} chars to execution ${executionId}`)
            return 'Result saved successfully.'
          }
        }),
      },
      stopWhen: stepCountIs(10),
    })

    // Consume the stream to completion (executes all tool calls)
    const finalText = await result.text

    // Prefer the explicitly saved result from save_result tool, fall back to final text
    const output = savedResult || finalText || 'Task completed with no output.'
    return { output, error: null }
  } catch (err: any) {
    console.error(`[ScheduledTasks] AI execution error for task ${task.id}:`, err)
    // Still return savedResult if the tool was called before the error
    if (savedResult) {
      return { output: savedResult, error: null }
    }
    return { output: '', error: err.message || 'AI execution failed' }
  }
}

// ─── Main cron handler ───────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET || process.env.NOTIFICATION_API_KEY
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await getSupabase()
    const now = new Date().toISOString()

    console.log('[ScheduledTasks] Cron triggered, checking for due tasks...')

    // Find all enabled tasks whose next_execution_at is in the past
    const { data: dueTasks, error: fetchError } = await supabase
      .from('scheduled_tasks')
      .select('*')
      .eq('enabled', true)
      .lte('next_execution_at', now)
      .order('next_execution_at', { ascending: true })
      .limit(5) // Process max 5 tasks per cron run to stay within Vercel timeout

    if (fetchError) {
      console.error('[ScheduledTasks] Fetch error:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch due tasks' }, { status: 500 })
    }

    if (!dueTasks || dueTasks.length === 0) {
      console.log('[ScheduledTasks] No due tasks found')
      return NextResponse.json({
        success: true,
        message: 'No due tasks',
        processed: 0,
        durationMs: Date.now() - startTime
      })
    }

    console.log(`[ScheduledTasks] Found ${dueTasks.length} due task(s)`)

    const results = []

    for (const task of dueTasks) {
      const taskStartTime = Date.now()

      // 1. Create execution record with status "running"
      const { data: execution, error: insertError } = await supabase
        .from('task_executions')
        .insert({
          task_id: task.id,
          user_id: task.user_id,
          status: 'running',
          started_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (insertError) {
        console.error(`[ScheduledTasks] Failed to create execution record for task ${task.id}:`, insertError)
        results.push({ taskId: task.id, name: task.name, status: 'error', error: 'Failed to create execution record' })
        continue
      }

      // 2. Execute the task (save_result tool writes output directly to DB)
      const { output, error: execError } = await executeTask(task, execution.id, supabase)
      const completedAt = new Date().toISOString()
      const durationMs = Date.now() - taskStartTime
      const status = execError ? 'failed' : 'completed'

      // 3. Final update: set duration_ms and ensure status/output are persisted
      //    (save_result already wrote output + status during AI execution,
      //     this catches duration_ms and handles the error/fallback case)
      const { error: updateExecError } = await supabase
        .from('task_executions')
        .update({
          status,
          completed_at: completedAt,
          output: output.substring(0, 10000),
          error_message: execError,
          duration_ms: durationMs,
        })
        .eq('id', execution.id)

      if (updateExecError) {
        console.error(`[ScheduledTasks] Failed to update execution ${execution.id}:`, updateExecError)
      }

      // 4. Update the task: increment count, set last_executed, recalculate next
      const nextExecution = getNextExecution(task.cron_expression)
      const { error: updateTaskError } = await supabase
        .from('scheduled_tasks')
        .update({
          execution_count: (task.execution_count || 0) + 1,
          last_executed_at: completedAt,
          next_execution_at: nextExecution,
          updated_at: completedAt,
        })
        .eq('id', task.id)

      if (updateTaskError) {
        console.error(`[ScheduledTasks] Failed to update task ${task.id}:`, updateTaskError)
      }

      results.push({
        taskId: task.id,
        name: task.name,
        status,
        executionId: execution.id,
        durationMs: Date.now() - taskStartTime,
        nextExecution,
      })

      console.log(`[ScheduledTasks] Task "${task.name}" ${status} in ${Date.now() - taskStartTime}ms`)
    }

    const summary = {
      success: true,
      timestamp: new Date().toISOString(),
      processed: results.length,
      results,
      durationMs: Date.now() - startTime,
    }

    console.log('[ScheduledTasks] Cron completed:', JSON.stringify(summary))
    return NextResponse.json(summary)

  } catch (error: any) {
    console.error('[ScheduledTasks] Fatal error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error',
      durationMs: Date.now() - startTime,
    }, { status: 500 })
  }
}

// POST alias for manual triggering
export async function POST(request: NextRequest) {
  return GET(request)
}
