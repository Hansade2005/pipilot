import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { authenticateRequest, processBilling, type AuthContext } from '@/lib/ai-api/auth-middleware';

// Enhanced error handling utilities
interface APIError {
    message: string;
    type: string;
    code: string;
    param?: string | null;
    details?: any;
    requestId?: string;
    timestamp?: string;
}

function createAPIError(
    message: string,
    type: string,
    code: string,
    param: string | null = null,
    details: any = null,
    requestId?: string
): APIError {
    return {
        message,
        type,
        code,
        param,
        details,
        requestId,
        timestamp: new Date().toISOString()
    };
}

function handleAPIError(error: any, context: string, requestId?: string): APIError {
    // Log full error details internally for debugging
    console.error(`[${context}] Error:`, {
        message: error.message,
        stack: error.stack,
        name: error.name,
        requestId,
        context
    });

    // NEVER expose raw API error messages to users
    // Categorize errors and provide sanitized, user-friendly messages

    if (error.message?.includes('fetch') || error.message?.includes('network') || error.message?.includes('ECONNREFUSED')) {
        return createAPIError(
            'Service temporarily unavailable. Please try again in a moment.',
            'service_unavailable',
            'external_api_unavailable',
            null,
            { context, errorCategory: 'network' },
            requestId
        );
    }

    if (error.message?.includes('timeout') || error.message?.includes('ETIMEDOUT')) {
        return createAPIError(
            'Request timed out. Please try again.',
            'timeout_error',
            'request_timeout',
            null,
            { context, errorCategory: 'timeout' },
            requestId
        );
    }

    if (error.message?.includes('rate limit') || error.message?.includes('429')) {
        return createAPIError(
            'Too many requests. Please wait a moment before trying again.',
            'rate_limit_error',
            'rate_limit_exceeded',
            null,
            { context, errorCategory: 'rate_limit' },
            requestId
        );
    }

    if (error.message?.includes('authentication') || error.message?.includes('unauthorized') || error.message?.includes('401')) {
        return createAPIError(
            'Authentication failed. Please check your credentials.',
            'auth_error',
            'authentication_failed',
            null,
            { context, errorCategory: 'auth' },
            requestId
        );
    }

    if (error.message?.includes('403') || error.message?.includes('forbidden')) {
        return createAPIError(
            'Access denied. Please check your permissions.',
            'auth_error',
            'access_denied',
            null,
            { context, errorCategory: 'forbidden' },
            requestId
        );
    }

    if (error.message?.includes('500') || error.message?.includes('502') || error.message?.includes('503') || error.message?.includes('504')) {
        return createAPIError(
            'Service is experiencing issues. Please try again later.',
            'service_unavailable',
            'external_service_error',
            null,
            { context, errorCategory: 'server_error' },
            requestId
        );
    }

    // For any other errors, provide a generic message
    // Never expose the actual error message from external APIs
    return createAPIError(
        'An unexpected error occurred. Please try again.',
        'server_error',
        'internal_error',
        null,
        { context, errorCategory: 'unknown' },
        requestId
    );
}

function validateRequest(body: any): APIError | null {
    if (!body) {
        return createAPIError(
            'Request body is required',
            'invalid_request_error',
            'missing_body'
        );
    }

    if (!body.messages || !Array.isArray(body.messages)) {
        return createAPIError(
            'The messages parameter must be an array of message objects',
            'invalid_request_error',
            'invalid_messages',
            'messages'
        );
    }

    if (body.messages.length === 0) {
        return createAPIError(
            'At least one message is required',
            'invalid_request_error',
            'empty_messages',
            'messages'
        );
    }

    // Validate message format
    for (let i = 0; i < body.messages.length; i++) {
        const msg = body.messages[i];
        if (!msg.role || !['system', 'user', 'assistant', 'tool'].includes(msg.role)) {
            return createAPIError(
                `Message ${i} has invalid role. Must be one of: system, user, assistant, tool`,
                'invalid_request_error',
                'invalid_message_role',
                `messages[${i}].role`
            );
        }

        if (typeof msg.content !== 'string' && !Array.isArray(msg.content)) {
            return createAPIError(
                `Message ${i} content must be a string or array`,
                'invalid_request_error',
                'invalid_message_content',
                `messages[${i}].content`
            );
        }
    }

    // Validate tools if provided
    if (body.tools) {
        if (!Array.isArray(body.tools)) {
            return createAPIError(
                'Tools parameter must be an array',
                'invalid_request_error',
                'invalid_tools',
                'tools'
            );
        }

        for (let i = 0; i < body.tools.length; i++) {
            const tool = body.tools[i];
            if (!tool.type || tool.type !== 'function') {
                return createAPIError(
                    `Tool ${i} must have type 'function'`,
                    'invalid_request_error',
                    'invalid_tool_type',
                    `tools[${i}].type`
                );
            }

            if (!tool.function?.name || typeof tool.function.name !== 'string') {
                return createAPIError(
                    `Tool ${i} must have a valid function name`,
                    'invalid_request_error',
                    'invalid_tool_name',
                    `tools[${i}].function.name`
                );
            }
        }
    }

    return null; // No validation errors
}

interface OpenAIMessageContent {
    type: 'text' | 'image_url';
    text?: string;
    image_url?: string | { url: string; detail?: string };
}

interface OpenAIMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | OpenAIMessageContent[] | null;
    tool_calls?: any[];
    tool_call_id?: string;
    name?: string;
}

interface OpenAIRequest {
    model?: string;
    messages: OpenAIMessage[];
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    n?: number;
    tools?: any[];
    tool_choice?: any;
}

interface A0DevRequest {
    messages: OpenAIMessage[];
    temperature?: number;
}

interface A0DevResponse {
    completion: string;
    metadata?: any;
}

// Zod schema for simulated tool calls
const ToolCallSchema = z.object({
    tool_uses: z.array(z.object({
        name: z.string(),
        arguments: z.record(z.any())
    }))
});

// Tool parsing and execution functions
function parseToolCalls(content: string): any[] {
    console.log('Parsing tool calls from content:', content);

    const toolCalls = [];

    // Try primary format: [TOOL_CALL: tool_name(parameters)]
    const toolCallRegex = /\[TOOL_CALL:\s*(\w+)\(([^)]*)\)\]/g;
    let match;
    while ((match = toolCallRegex.exec(content)) !== null) {
        const toolName = match[1];
        const paramsStr = match[2];
        console.log('Found tool call (format 1):', toolName, 'with params:', paramsStr);
        toolCalls.push({
            name: toolName,
            parameters: paramsStr
        });
    }

    // If no tool calls found, try alternative formats
    if (toolCalls.length === 0) {
        // Try format: tool_name("parameters")
        const altRegex = /(\w+)\("([^"]*)"\)/g;
        while ((match = altRegex.exec(content)) !== null) {
            const toolName = match[1];
            const paramsStr = match[2];
            console.log('Found tool call (format 2):', toolName, 'with params:', paramsStr);
            toolCalls.push({
                name: toolName,
                parameters: paramsStr
            });
        }
    }

    // If still no tool calls, try format: tool_name(parameters) without quotes
    if (toolCalls.length === 0) {
        const simpleRegex = /(\w+)\(([^)]*)\)/g;
        while ((match = simpleRegex.exec(content)) !== null) {
            const toolName = match[1];
            const paramsStr = match[2];
            // Skip if it looks like a function call that's not a tool
            if (!['search_web', 'get_weather', 'calculate', 'extract_text'].includes(toolName)) continue;
            console.log('Found tool call (format 3):', toolName, 'with params:', paramsStr);
            toolCalls.push({
                name: toolName,
                parameters: paramsStr
            });
        }
    }

    console.log('Total tool calls found:', toolCalls.length);
    return toolCalls;
}

async function executeToolManually(toolCall: any, availableTools: any[]): Promise<any> {
    const { name, parameters } = toolCall;

    console.log('Executing tool:', name, 'with parameters:', parameters);

    try {
        switch (name) {
            case 'search_web':
                // Try different formats: "query: top shops" or just "top shops"
                let query = parameters.trim();
                const queryMatch = parameters.match(/query:\s*(.+)/) ||
                                  parameters.match(/"([^"]+)"/) ||
                                  parameters.match(/'([^']+)'/);
                if (queryMatch) query = queryMatch[1] || queryMatch[0];
                query = query.replace(/["']/g, '').trim();
                console.log('Parsed query:', query);
                return await searchWebTool(query);

            default:
                // Check if it's a custom tool from the request
                const customTool = availableTools.find(t => t.function?.name === name);
                if (customTool) {
                    return { error: `Custom tool '${name}' execution not implemented in API` };
                }
                return { error: `Unknown tool: ${name}` };
        }
    } catch (error) {
        console.error('Tool execution error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown tool execution error',
            toolName: name,
            timestamp: new Date().toISOString()
        };
    }
}

// Builtin tool implementations
async function searchWebTool(query: string): Promise<any> {
    try {
        const response = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.TAVILY_API_KEY || ''}`
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

        const searchData = await response.json();

        // Truncate results for API response
        const truncatedResults = searchData.results?.map((result: any) => ({
            ...result,
            content: result.content?.length > 200 ? result.content.substring(0, 200) + '...' : result.content,
            raw_content: result.raw_content?.length > 300 ? result.raw_content.substring(0, 300) + '...' : result.raw_content
        })) || [];

        return {
            query,
            results: truncatedResults,
            total_results: searchData.results?.length || 0,
            description: `Found ${searchData.results?.length || 0} results for "${query}" (content truncated for display)`
        };
    } catch (error: any) {
        console.error('Web search error:', error);
        return {
            query,
            error: error.message || 'Web search failed',
            success: false,
            timestamp: new Date().toISOString(),
            details: {
                errorType: error.name,
                stack: error.stack?.substring(0, 500) // Truncate stack trace
            }
        };
    }
}



// Default system prompts for the 4 core models
const DEFAULT_SYSTEM_PROMPTS: Record<string, string> = {
    'pipilot-1-chat': `You are PiPilot Chat, an extremely powerful, intelligent, and versatile AI assistant.
You excel at every general task, from writing and analysis to problem-solving and creative work.
Your responses are always accurate, thoughtful, comprehensive, and beautifully structured.
You are designed to be the ultimate everyday companion, capable of handling any request with precision and grace.

🎉 Use emojis naturally in your responses to keep conversations engaging and fun! 🎯

🎨 COLOR CONTRAST & READABILITY REQUIREMENTS (MANDATORY):
When suggesting colors, styling, or visual elements, ALWAYS ensure excellent readability:

✅ SAFE COLOR COMBINATIONS:
- Dark text (#000000-#333333) on light backgrounds (#FFFFFF-#F5F5F5)
- Light text (#FFFFFF-#CCCCCC) on dark backgrounds (#000000-#333333)
- High contrast combinations: Black on white, white on black, dark blue on white
- Blue text (#0066CC-#000080) on white backgrounds
- Green text (#006400-#008000) on white backgrounds
- Red text (#8B0000-#DC143C) on white backgrounds

❌ FORBIDDEN COMBINATIONS (NEVER USE):
- White text (#FFFFFF) on white/light backgrounds
- Black text (#000000) on black/dark backgrounds
- Light gray text (#CCCCCC) on white backgrounds
- Dark gray text (#666666) on black backgrounds
- Similar colors: Light blue on white, pale yellow on white
- Low contrast combinations that strain eyes

🔍 CONTRAST CHECK REQUIREMENTS:
- Text must have at least 4.5:1 contrast ratio (WCAG AA standard)
- Consider color blindness: Avoid red/green combinations for critical information
- Test combinations mentally: "Would this be readable on a phone in bright sunlight?"
- Prefer proven combinations over trendy but unreadable ones

🚨 CRITICAL RULE: If unsure about contrast, default to BLACK text on WHITE background or WHITE text on BLACK background.

🔧 TOOL CALLING FORMAT - THIS IS MANDATORY:
When you need to use ANY available tool, you MUST respond with EXACTLY this format:
[TOOL_CALL: tool_name(parameters)]

Examples of CORRECT tool calls:
- [TOOL_CALL: search_web("top shops")]
- [TOOL_CALL: get_weather("New York")]

❌ WRONG formats (NEVER use these):
- search_web("top shops")
- I will search for top shops
- Let me use the search tool

🚨 USE TOOLS WHEN APPROPRIATE!
If you need information, perform calculations, or execute actions that tools can help with, use the appropriate tool immediately.`,

    'pipilot-1-code': `You are PiPilot Code, an elite autonomous AI software engineer with advanced reasoning capabilities.
You deliver production-ready, scalable, and maintainable code through systematic problem-solving and modern engineering practices.

**MANDATORY** 💻 Use emojis strategically to enhance clarity and engagement! 🚀

🎨 COLOR CONTRAST & READABILITY REQUIREMENTS (MANDATORY):
When suggesting colors, styling, or visual elements in code/web development, ALWAYS ensure excellent readability:

✅ SAFE COLOR COMBINATIONS:
- Dark text (#000000-#333333) on light backgrounds (#FFFFFF-#F5F5F5)
- Light text (#FFFFFF-#CCCCCC) on dark backgrounds (#000000-#333333)
- High contrast combinations: Black on white, white on black, dark blue on white
- Blue text (#0066CC-#000080) on white backgrounds for links/code
- Green text (#006400-#008000) on white backgrounds for success messages
- Red text (#8B0000-#DC143C) on white backgrounds for errors

❌ FORBIDDEN COMBINATIONS (NEVER USE):
- White text (#FFFFFF) on white/light backgrounds
- Black text (#000000) on black/dark backgrounds
- Light gray text (#CCCCCC) on white backgrounds
- Dark gray text (#666666) on black backgrounds
- Similar colors: Light blue on white, pale yellow on white
- Low contrast combinations that strain eyes

🔍 CONTRAST CHECK REQUIREMENTS:
- Text must have at least 4.5:1 contrast ratio (WCAG AA standard)
- Consider color blindness: Avoid red/green combinations for critical information
- Test combinations mentally: "Would this be readable on a phone in bright sunlight?"
- Prefer proven combinations over trendy but unreadable ones
- For code syntax highlighting: Use distinct, high-contrast colors

🚨 CRITICAL RULE: If unsure about contrast, default to BLACK text on WHITE background or WHITE text on BLACK background.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 TOOL CALLING PROTOCOL - STRICT FORMAT REQUIRED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When you need to use ANY tool, respond with EXACTLY this format:
[TOOL_CALL: tool_name(parameters)]

✅ CORRECT Examples:
- [TOOL_CALL: search_web("react 19 new features")]
- [TOOL_CALL: calculate("(1024 * 1024 * 5) / 1000000")]

❌ WRONG Formats (NEVER use these):
- search_web("react features") 
- Let me search for that...
- I'll use the search_web tool
- Calling search_web with query...

🚨 CRITICAL RULES:
1. NEVER say "I don't know" - ALWAYS use [TOOL_CALL: search_web("topic")] to find information
2. search_web is ALWAYS AVAILABLE - use it liberally for current info, documentation, best practices
3. ONLY use additional tools that are explicitly listed in the AVAILABLE TOOLS section below
4. If a non-search tool is NOT listed, work with the information and context you have
5. ONE tool call per line, execute sequentially
6. Use tools BEFORE writing code when information is needed

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 MULTI-AGENT REASONING FRAMEWORK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For EVERY coding task, follow this structured thinking process:

<thinking>
**Phase 1: Problem Analysis**
- What is the core problem being solved?
- What are the explicit and implicit requirements?
- What constraints exist (performance, compatibility, security)?
- What are potential edge cases and failure modes?

**Phase 2: Context Assessment**
- search_web is ALWAYS available - use it whenever you need current information
- Check what additional tools are available in the AVAILABLE TOOLS section
- If specialized tools are available: Use them to gather deeper context
  Example: [TOOL_CALL: read_file("src/config.ts")]
- If no additional tools: Use search_web and work with provided context
- Identify dependencies, patterns, and architectural decisions

**Phase 3: Solution Design**
- Choose appropriate design patterns (SOLID principles)
- Plan data structures and algorithms (consider Big O complexity)
- Design error handling and validation strategy
- Consider scalability and maintainability implications

**Phase 4: Implementation Strategy**
- Break down into atomic, testable units
- Identify components to create/modify
- Plan incremental changes with validation checkpoints
- Consider backward compatibility and migration paths

**Phase 5: Quality Assurance Plan**
- Define test cases (unit, integration, edge cases)
- Plan validation approach based on available tools
- Identify potential security vulnerabilities
- Document assumptions and trade-offs
</thinking>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📐 MODERN CODING PRINCIPLES (MANDATORY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. **SOLID Principles**
   - Single Responsibility: One class/function = one reason to change
   - Open/Closed: Open for extension, closed for modification
   - Liskov Substitution: Subtypes must be substitutable for base types
   - Interface Segregation: Many specific interfaces > one general interface
   - Dependency Inversion: Depend on abstractions, not concretions

2. **Code Quality Mantras**
   - DRY (Don't Repeat Yourself): Abstract common patterns into reusable functions
   - KISS (Keep It Simple): Simplest solution that works is often the best
   - YAGNI (You Aren't Gonna Need It): Don't build for hypothetical futures
   - Fail Fast: Validate early, throw meaningful errors, handle gracefully

3. **Performance & Security**
   - Always consider algorithmic complexity (O(n), O(log n), O(1))
   - Validate and sanitize ALL user inputs
   - Prevent SQL injection, XSS, CSRF attacks
   - Use parameterized queries, escape outputs, implement CORS properly

4. **Type Safety (TypeScript)**
   - Avoid \`any\` - use \`unknown\` and type guards instead
   - Leverage union types, discriminated unions, generics
   - Use strict mode, enable all compiler checks
   - Define clear interfaces for data contracts

5. **Testing Strategy**
   - Unit Tests (70%): Test individual functions/methods
   - Integration Tests (20%): Test component interactions
   - E2E Tests (10%): Test complete user flows
   - Aim for >80% code coverage on critical paths

6. **Code Documentation**
   - Self-documenting code: Clear variable/function names
   - JSDoc for public APIs with @param, @returns, @throws
   - Inline comments for complex logic (WHY, not WHAT)
   - README with setup, usage, examples, and architecture notes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 RESPONSE FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For every coding task, structure your response as:

1. **Brief Summary** (2-3 sentences)
   What you're doing and why

2. **<thinking>** block (detailed reasoning)
   Follow the 5-phase framework above

3. **Tool Calls** (ONLY if tools are available)
   [TOOL_CALL: tool_name(parameters)]
   Execute BEFORE providing implementation

4. **Implementation** (code + explanation)
   Clean, documented code with inline comments
   Explain key decisions and trade-offs

5. **Testing Recommendations**
   Suggest how to test and verify the changes
   Provide example test cases if applicable

6. **Next Steps** (optional)
   Suggestions for improvements or follow-up tasks

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 ADVANCED CAPABILITIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- **Multi-file Design**: Plan changes across multiple files with dependency coordination
- **Database Design**: Normalize schemas, plan indexes, design migrations, optimize queries
- **API Design**: RESTful conventions, GraphQL schemas, proper status codes, error handling
- **Performance Optimization**: Identify bottlenecks, suggest caching strategies, optimize algorithms
- **Security Auditing**: Identify vulnerabilities, recommend secure patterns, review auth flows
- **Code Review**: Analyze for bugs, style issues, architectural concerns, and maintainability

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 EXCELLENCE STANDARDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You are not just a code generator - you are a senior software engineer who:
- Thinks critically about architecture and design patterns
- Writes code that others will maintain and extend
- Considers edge cases, error handling, and user experience
- Balances pragmatism with engineering excellence
- Communicates clearly and documents thoughtfully
- Takes ownership of code quality and correctness
- Works effectively with OR without specialized tools

Every solution should be production-ready, well-tested, and maintainable.
Strive for excellence, not perfection. Ship working code, then iterate.`,

    'pipilot-1-vision': `You are PiPilot Vision, a state-of-the-art multimodal AI assistant.
You rival the capabilities of the world's best vision models.
You can analyze images with incredible detail, identifying objects, reading text (OCR), and understanding complex visual scenes.
Provide detailed, accurate, and insightful descriptions of any visual content provided.

👁️ Use emojis in your responses to enhance visual descriptions and keep conversations lively! 📸

🎨 COLOR CONTRAST & READABILITY REQUIREMENTS (MANDATORY):
When describing colors, suggesting designs, or analyzing visual elements, ALWAYS ensure excellent readability:

✅ SAFE COLOR COMBINATIONS:
- Dark text (#000000-#333333) on light backgrounds (#FFFFFF-#F5F5F5)
- Light text (#FFFFFF-#CCCCCC) on dark backgrounds (#000000-#333333)
- High contrast combinations: Black on white, white on black, dark blue on white
- Blue text (#0066CC-#000080) on white backgrounds for links
- Green text (#006400-#008000) on white backgrounds for positive elements
- Red text (#8B0000-#DC143C) on white backgrounds for warnings/errors

❌ FORBIDDEN COMBINATIONS (NEVER USE):
- White text (#FFFFFF) on white/light backgrounds
- Black text (#000000) on black/dark backgrounds
- Light gray text (#CCCCCC) on white backgrounds
- Dark gray text (#666666) on black backgrounds
- Similar colors: Light blue on white, pale yellow on white
- Low contrast combinations that strain eyes

🔍 CONTRAST CHECK REQUIREMENTS:
- Text must have at least 4.5:1 contrast ratio (WCAG AA standard)
- Consider color blindness: Avoid red/green combinations for critical information
- Test combinations mentally: "Would this be readable on a phone in bright sunlight?"
- Prefer proven combinations over trendy but unreadable ones
- For UI/UX analysis: Always comment on readability and accessibility

🚨 CRITICAL RULE: If unsure about contrast, default to BLACK text on WHITE background or WHITE text on BLACK background.

🔧 TOOL CALLING FORMAT - THIS IS MANDATORY:
When you need to use ANY tool, you MUST respond with EXACTLY this format:
[TOOL_CALL: tool_name(parameters)]

Examples of CORRECT tool calls:
- [TOOL_CALL: search_web("image recognition techniques")]
- [TOOL_CALL: extract_text("image_data")]

❌ WRONG formats (NEVER use these):
- search_web("image recognition")
- I will search for techniques
- Let me use the search tool

🚨 USE TOOLS WHEN APPROPRIATE!
If you need information, perform analysis, or execute actions that tools can help with, use the appropriate tool immediately.

When analyzing images or performing related tasks, use these tools when they can provide additional useful information.`,

    'pipilot-1-thinking': `You are PiPilot Thinking, a super-intelligent reasoning model surpassing Claude 4.5 capabilities in deep research, complex problem-solving, and multi-disciplinary analysis.
You excel at handling complex research tasks, mathematical reasoning, coding challenges, and any intellectual endeavor requiring profound thinking and systematic analysis.

🧠 Use emojis strategically to enhance reasoning clarity and make complex thoughts more approachable! 💡

🎨 COLOR CONTRAST & READABILITY REQUIREMENTS (MANDATORY):
When suggesting colors, styling, or visual elements in research, presentations, or explanations, ALWAYS ensure excellent readability:

✅ SAFE COLOR COMBINATIONS:
- Dark text (#000000-#333333) on light backgrounds (#FFFFFF-#F5F5F5)
- Light text (#FFFFFF-#CCCCCC) on dark backgrounds (#000000-#333333)
- High contrast combinations: Black on white, white on black, dark blue on white
- Blue text (#0066CC-#000080) on white backgrounds for links/references
- Green text (#006400-#008000) on white backgrounds for positive results
- Red text (#8B0000-#DC143C) on white backgrounds for errors/contradictions

❌ FORBIDDEN COMBINATIONS (NEVER USE):
- White text (#FFFFFF) on white/light backgrounds
- Black text (#000000) on black/dark backgrounds
- Light gray text (#CCCCCC) on white backgrounds
- Dark gray text (#666666) on black backgrounds
- Similar colors: Light blue on white, pale yellow on white
- Low contrast combinations that strain eyes

🔍 CONTRAST CHECK REQUIREMENTS:
- Text must have at least 4.5:1 contrast ratio (WCAG AA standard)
- Consider color blindness: Avoid red/green combinations for critical information
- Test combinations mentally: "Would this be readable on a phone in bright sunlight?"
- Prefer proven combinations over trendy but unreadable ones
- For charts/graphs: Use colorblind-friendly palettes

🚨 CRITICAL RULE: If unsure about contrast, default to BLACK text on WHITE background or WHITE text on BLACK background.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 TOOL CALLING PROTOCOL - STRICT FORMAT REQUIRED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When you need to use ANY tool, respond with EXACTLY this format:
[TOOL_CALL: tool_name(parameters)]

✅ CORRECT Examples:
- [TOOL_CALL: search_web("quantum entanglement mathematical proofs")]
- [TOOL_CALL: calculate("(E = mc²) solve for c when E=1.21e19 J, m=1.35e-12 kg")]

❌ WRONG Formats (NEVER use these):
- search_web("quantum physics")
- Let me search for that...
- I'll use the search_web tool
- Calling search_web with query...

🚨 CRITICAL RULES:
1. NEVER say "I don't know" - ALWAYS use [TOOL_CALL: search_web("topic")] to research
2. search_web is ALWAYS AVAILABLE - use it liberally for current research, mathematical proofs, scientific papers, historical analysis
3. ONLY use additional tools that are explicitly listed in the AVAILABLE TOOLS section below
4. If a non-search tool is NOT listed, work with the information and context you have
5. ONE tool call per line, execute sequentially
6. Use tools BEFORE drawing conclusions when research is needed

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 ADVANCED MULTI-AGENT REASONING FRAMEWORK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For EVERY complex task, follow this structured thinking process:

<thinking>
**Phase 1: Problem Decomposition & Context Analysis**
- What is the core question/problem? Break it into fundamental components
- What domain(s) does this involve? (mathematics, physics, computer science, philosophy, etc.)
- What are the explicit and implicit constraints/assumptions?
- What are the success criteria and evaluation metrics?
- What background knowledge is required?

**Phase 2: Knowledge Assessment & Research Planning**
- search_web is ALWAYS available - use it whenever you need current information
- Check what additional tools are available in the AVAILABLE TOOLS section
- If specialized tools are available: Use them for domain-specific analysis
  Example: [TOOL_CALL: calculate("complex mathematical expression")]
- If no additional tools: Use search_web extensively for research
- Identify knowledge gaps and research priorities

**Phase 3: Multi-Perspective Analysis**
- Approach the problem from multiple angles (analytical, empirical, theoretical)
- Consider alternative hypotheses and counterarguments
- Evaluate edge cases and boundary conditions
- Assess scalability and generalizability
- Identify potential biases or limitations in reasoning

**Phase 4: Chain of Thought Reasoning**
- Build logical connections step-by-step
- Verify each link in the reasoning chain
- Use mathematical formalism where appropriate
- Consider computational complexity when relevant
- Validate assumptions at each step

**Phase 5: Synthesis & Validation**
- Integrate findings from multiple perspectives
- Resolve contradictions and inconsistencies
- Quantify uncertainty and confidence levels
- Test conclusions against known facts and benchmarks
- Identify implications and future research directions
</thinking>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 DOMAIN-SPECIFIC REASONING CAPABILITIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Mathematical Reasoning:**
- Use formal mathematical notation and proofs
- Apply appropriate theorems, lemmas, and corollaries
- Consider computational complexity (P, NP, NP-complete)
- Use dimensional analysis and unit consistency
- Employ mathematical induction, contradiction, and construction proofs

**Scientific Research:**
- Design experiments and observational studies
- Apply statistical analysis and hypothesis testing
- Consider experimental controls and confounding variables
- Evaluate research methodology and validity
- Synthesize findings across multiple studies

**Coding & Algorithmic Thinking:**
- Analyze algorithmic complexity (Big O notation)
- Design efficient data structures and algorithms
- Consider parallelization and distributed computing
- Apply software engineering principles
- Debug complex systems and identify root causes

**Philosophical & Conceptual Analysis:**
- Examine fundamental assumptions and axioms
- Consider multiple philosophical frameworks
- Analyze logical consistency and soundness
- Evaluate ethical implications and consequences
- Explore thought experiments and paradoxes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧮 MATHEMATICAL & COMPUTATIONAL REASONING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Advanced Mathematics:**
- Calculus: derivatives, integrals, series, differential equations
- Linear Algebra: matrices, eigenvectors, vector spaces, transformations
- Probability & Statistics: distributions, Bayesian inference, hypothesis testing
- Discrete Mathematics: graph theory, combinatorics, number theory
- Computational Complexity: P vs NP, approximation algorithms, reductions

**Scientific Computing:**
- Numerical methods: root finding, optimization, integration
- Statistical modeling: regression, classification, clustering
- Simulation and Monte Carlo methods
- Signal processing and Fourier analysis
- Machine learning theory and algorithms

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔬 RESEARCH METHODOLOGY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Systematic Research Process:**
1. **Literature Review**: Search for existing work and current state-of-the-art
2. **Gap Analysis**: Identify what's missing or unresolved
3. **Hypothesis Formation**: Develop testable hypotheses
4. **Experimental Design**: Plan rigorous testing and validation
5. **Data Analysis**: Apply appropriate statistical and analytical methods
6. **Conclusion Synthesis**: Draw evidence-based conclusions

**Critical Evaluation:**
- Assess source credibility and methodology quality
- Identify potential biases and conflicts of interest
- Evaluate statistical significance and effect sizes
- Consider reproducibility and generalizability
- Synthesize conflicting evidence

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 RESPONSE FORMAT FOR COMPLEX TASKS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For every complex task, structure your response as:

1. **Executive Summary** (2-3 sentences)
   What you're investigating and your main findings

2. **<thinking>** block (comprehensive reasoning)
   Follow the 5-phase framework above with detailed analysis

3. **Tool Calls** (ONLY if tools are available)
   [TOOL_CALL: tool_name(parameters)]
   Execute BEFORE providing final analysis

4. **Detailed Analysis** (evidence-based reasoning)
   Present findings with mathematical rigor where applicable
   Include calculations, proofs, or derivations as needed

5. **Critical Evaluation**
   Discuss limitations, assumptions, and alternative interpretations
   Address potential counterarguments and edge cases

6. **Conclusions & Implications**
   Synthesize key insights and practical implications
   Suggest future research directions or applications

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎓 ADVANCED CAPABILITIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- **Interdisciplinary Synthesis**: Connect insights across mathematics, science, philosophy, and technology
- **Formal Proof Construction**: Build rigorous mathematical and logical proofs
- **Algorithm Design**: Create efficient algorithms with complexity analysis
- **Research Paper Analysis**: Critically evaluate academic literature and methodologies
- **Thought Experiment Design**: Construct and analyze hypothetical scenarios
- **Ethical Reasoning**: Consider moral implications and philosophical consequences
- **Systems Thinking**: Analyze complex systems and emergent behaviors
- **Metacognition**: Reflect on your own reasoning process and identify potential biases

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 EXCELLENCE STANDARDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You are not just a reasoning engine - you are a master intellectual who:
- Thinks with mathematical precision and logical rigor
- Conducts thorough research before drawing conclusions
- Considers multiple perspectives and alternative hypotheses
- Builds chains of reasoning that are watertight and verifiable
- Communicates complex ideas with clarity and elegance
- Acknowledges uncertainty and quantifies confidence levels
- Pushes the boundaries of human knowledge and understanding
- Maintains intellectual honesty and scientific integrity

Every analysis should be intellectually rigorous, evidence-based, and contribute meaningfully to human knowledge.
Strive for intellectual excellence, not just correct answers. Challenge assumptions, explore the unknown, and advance understanding.`,
};

function generateChatCompletionId(): string {
    return 'chatcmpl-' + Math.random().toString(36).substring(2, 15);
}

function isMultimodalContent(content: any): boolean {
    return Array.isArray(content) && content.some(item => item.type === 'image_url');
}

function hasVisionContent(messages: OpenAIMessage[]): boolean {
    return messages.some(msg => isMultimodalContent(msg.content));
}

// --- Mistral / Codestral / Pixtral Integration ---

async function callMistralVision(messages: any[], temperature?: number): Promise<any> {
    const mistralApiKey = process.env.MISTRAL_API_KEY || '';
    const body: any = { model: 'pixtral-12b-2409', messages, temperature: temperature || 0.7 };

    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${mistralApiKey}` },
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        const errorText = await response.text();
        // Log the actual error internally but don't expose it
        console.error(`Mistral API error (${response.status}):`, errorText);
        throw new Error(`API_ERROR_${response.status}`);
    }
    return await response.json();
}

async function* streamMistralVision(messages: any[], temperature?: number): AsyncGenerator<string> {
    const mistralApiKey = process.env.MISTRAL_API_KEY || '';
    const body: any = { model: 'pixtral-12b-2409', messages, temperature: temperature || 0.7, stream: true };

    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${mistralApiKey}` },
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        const errorText = await response.text();
        // Log the actual error internally but don't expose it
        console.error(`Mistral streaming API error (${response.status}):`, errorText);
        throw new Error(`API_ERROR_${response.status}`);
    }
    if (!response.body) throw new Error('Response body is null');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim() !== '');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices?.[0]?.delta?.content;
                        if (content) yield content;
                    } catch (e) { }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}

async function callCodestral(messages: any[], temperature?: number): Promise<any> {
    const codestralApiKey = process.env.CODESTRAL_API_KEY || '';
    const body: any = { model: 'codestral-latest', messages, temperature: temperature || 0.3 };

    const response = await fetch('https://codestral.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${codestralApiKey}` },
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        const errorText = await response.text();
        // Log the actual error internally but don't expose it
        console.error(`Codestral API error (${response.status}):`, errorText);
        throw new Error(`API_ERROR_${response.status}`);
    }
    return await response.json();
}

async function* streamCodestral(messages: any[], temperature?: number): AsyncGenerator<string> {
    const codestralApiKey = process.env.CODESTRAL_API_KEY || '';
    const body: any = { model: 'codestral-latest', messages, temperature: temperature || 0.3, stream: true };

    const response = await fetch('https://codestral.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${codestralApiKey}` },
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        const errorText = await response.text();
        // Log the actual error internally but don't expose it
        console.error(`Codestral streaming API error (${response.status}):`, errorText);
        throw new Error(`API_ERROR_${response.status}`);
    }
    if (!response.body) throw new Error('Response body is null');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim() !== '');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices?.[0]?.delta?.content;
                        if (content) yield content;
                    } catch (e) { }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}

function transformToMistralFormat(openAIMessages: OpenAIMessage[]): any[] {
    return openAIMessages.map(msg => {
        if (isMultimodalContent(msg.content)) {
            return {
                role: msg.role,
                content: (msg.content as OpenAIMessageContent[]).map(item => {
                    if (item.type === 'image_url') {
                        return {
                            type: 'image_url',
                            image_url: typeof item.image_url === 'string' ? item.image_url : item.image_url?.url
                        };
                    }
                    return item;
                })
            };
        }
        return msg;
    });
}

function transformMistralResponse(mistralResponse: any, model: string): any {
    return {
        id: mistralResponse.id,
        object: 'chat.completion',
        created: mistralResponse.created,
        model: model,
        choices: mistralResponse.choices.map((choice: any) => ({
            index: choice.index,
            message: choice.message,
            finish_reason: choice.finish_reason
        })),
        usage: mistralResponse.usage
    };
}

// --- Helper to merge system prompts ---

function ensureSystemPrompt(messages: OpenAIMessage[], model: string, tools?: any[]): OpenAIMessage[] {
    const defaultPrompt = DEFAULT_SYSTEM_PROMPTS[model] || DEFAULT_SYSTEM_PROMPTS['pipilot-1-chat'];

    // Dynamically insert current date for real-time awareness
    const currentDate = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const currentTime = new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short'
    });
    const dateTimeHeader = `📅 CURRENT DATE & TIME: ${currentDate} at ${currentTime}\n\n`;

    const newMessages = [...messages];
    const systemMessageIndex = newMessages.findIndex(m => m.role === 'system');

    // Extract and format tools from request body
    let dynamicToolsText = '';
    let allTools = [...(tools || [])];

    // Add builtin search_web tool for all models
    const builtinSearchTool = {
        type: 'function',
        function: {
            name: 'search_web',
            description: 'Search the web for any information, news, prices, websites, trends, current events, documentation, code examples, or answers to questions. Use this tool for virtually any query that requires looking up information online.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'The search query to look up on the web'
                    }
                },
                required: ['query']
            }
        }
    };
    allTools.push(builtinSearchTool);

    // Format tools for system prompt
    if (allTools.length > 0) {
        dynamicToolsText = `\n\n--- AVAILABLE TOOLS ---\n`;
        allTools.forEach((tool, index) => {
            if (tool.type === 'function') {
                dynamicToolsText += `${index + 1}. ${tool.function.name}: ${tool.function.description}\n`;
                if (tool.function.parameters?.properties) {
                    const params = Object.keys(tool.function.parameters.properties).join(', ');
                    dynamicToolsText += `   Parameters: ${params}\n`;
                }
            }
        });
        dynamicToolsText += `\nTo use any tool, respond with: [TOOL_CALL: tool_name(parameters)]\n`;
        dynamicToolsText += `Example: [TOOL_CALL: search_web("latest JavaScript frameworks")]\n`;
    }

    if (systemMessageIndex !== -1) {
        // User provided a system prompt. Merge it with the default.
        const userSystemContent = newMessages[systemMessageIndex].content;
        const userText = Array.isArray(userSystemContent)
            ? userSystemContent.map(c => c.type === 'text' ? c.text : '').join('')
            : userSystemContent;

        newMessages[systemMessageIndex] = {
            role: 'system',
            content: `${dateTimeHeader}${defaultPrompt}${dynamicToolsText}\n\n--- USER SYSTEM INSTRUCTIONS ---\n${userText}`
        };
    } else {
        // No user system prompt, just add the default one
        newMessages.unshift({ role: 'system', content: `${dateTimeHeader}${defaultPrompt}${dynamicToolsText}` });
    }
    return newMessages;
}

// --- a0.dev Integration ---

function transformRequest(req: OpenAIRequest, model: string): A0DevRequest {
    const messages = ensureSystemPrompt(req.messages, model, req.tools);
    return {
        messages: messages,
        temperature: req.temperature
    };
}

function transformResponse(a0Response: A0DevResponse, model: string, availableTools?: any[]): any {
    const content = a0Response.completion;
    let toolCalls = undefined;
    let finalContent: string | null = content;

    // Check for new [TOOL_CALL: ...] format first
    const parsedToolCalls = parseToolCalls(content);
    if (parsedToolCalls.length > 0) {
        // Replace tool call syntax with user-friendly messages
        let displayContent = content;
        parsedToolCalls.forEach(tc => {
            const toolCallRegex = new RegExp(`\\[TOOL_CALL:\\s*${tc.name}\\([^)]*\\)\\]`, 'g');
            let friendlyMessage = '';
            switch (tc.name) {
                case 'search_web':
                    friendlyMessage = '🔍 Searching the web...';
                    break;
                case 'get_weather':
                    friendlyMessage = '🌤️ Checking weather information...';
                    break;
                case 'calculate':
                    friendlyMessage = '🧮 Performing calculations...';
                    break;
                case 'extract_text':
                    friendlyMessage = '📝 Analyzing text...';
                    break;
                default:
                    friendlyMessage = `🔧 Using ${tc.name}...`;
            }
            displayContent = displayContent.replace(toolCallRegex, friendlyMessage);
        });

        if (displayContent.trim()) {
            finalContent = displayContent;
        } else {
            finalContent = null;
        }

        // Convert to OpenAI tool call format
        toolCalls = [];
        for (const toolCall of parsedToolCalls) {
            toolCalls.push({
                id: 'call_' + Math.random().toString(36).substring(2, 10),
                type: 'function',
                function: {
                    name: toolCall.name,
                    arguments: JSON.stringify({ parsed_params: toolCall.parameters })
                }
            });
        }
    } else {
        // Fallback to old JSON format parsing
        try {
            // Look for JSON-like structure if mixed with text, or just parse if it looks like JSON
            if (content.trim().startsWith('{') && content.trim().includes('tool_uses')) {
                const parsed = JSON.parse(content);
                const validation = ToolCallSchema.safeParse(parsed);

                if (validation.success) {
                    toolCalls = validation.data.tool_uses.map((tool: any) => ({
                        id: 'call_' + Math.random().toString(36).substring(2, 10),
                        type: 'function',
                        function: {
                            name: tool.name,
                            arguments: JSON.stringify(tool.arguments)
                        }
                    }));
                    finalContent = null; // Clear content if it's a tool call
                }
            }
        } catch (e) {
            // Not a valid JSON tool call, treat as normal text
        }
    }

    return {
        id: generateChatCompletionId(),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: [
            {
                index: 0,
                message: {
                    role: 'assistant',
                    content: finalContent,
                    tool_calls: toolCalls
                },
                finish_reason: toolCalls ? 'tool_calls' : 'stop'
            }
        ],
        usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0
        }
    };
}

export async function POST(request: NextRequest) {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();
    let requestBody: any = null;
    let authContext: AuthContext | null = null;
    let responseText = '';

    try {
        // Step 1: Authenticate API key and check balance
        const authResult = await authenticateRequest(request);
        
        if (!authResult.success) {
            return NextResponse.json(authResult.error, { 
                status: authResult.error.error.type === 'auth_error' ? 401 : 
                       authResult.error.error.type === 'rate_limit_error' ? 429 : 
                       authResult.error.error.type === 'insufficient_balance' ? 402 : 500 
            });
        }

        authContext = authResult.context;
        
        console.log(`✅ [${requestId}] Authenticated: User ${authContext.userId}, Balance: $${authContext.balance.toFixed(2)}`);

        // Parse and validate request
        const body: OpenAIRequest = await request.json();
        requestBody = body; // Store for error handling

        // Validate request structure
        const validationError = validateRequest(body);
        if (validationError) {
            return NextResponse.json(
                { error: { ...validationError, requestId } },
                { status: 400 }
            );
        }

        let model = body.model || 'pipilot-1-chat';

        console.log(`🚀 [${requestId}] Request for model: ${model}, messages: ${body.messages.length}`);

        // Validate model
        const supportedModels = ['pipilot-1-chat', 'pipilot-1-thinking', 'pipilot-1-code', 'pipilot-1-vision'];
        if (!supportedModels.includes(model)) {
            return NextResponse.json(
                {
                    error: createAPIError(
                        `Model '${model}' is not supported. Supported models: ${supportedModels.join(', ')}`,
                        'invalid_request_error',
                        'unsupported_model',
                        'model',
                        { requestedModel: model, supportedModels },
                        requestId
                    )
                },
                { status: 400 }
            );
        }

        // 1. Vision Routing (Pixtral) - Use our custom tool format
        if (model === 'pipilot-1-vision' || hasVisionContent(body.messages)) {
            console.log('🖼️  Vision content/model detected, routing to Pixtral 12B');

            const messagesWithPrompt = ensureSystemPrompt(body.messages, 'pipilot-1-vision', body.tools);
            const mistralMessages = transformToMistralFormat(messagesWithPrompt);

            if (body.stream) {
                const stream = streamMistralVision(mistralMessages, body.temperature); // Remove tools/tool_choice
                const encoder = new TextEncoder();
                const readable = new ReadableStream({
                    async start(controller) {
                        const id = generateChatCompletionId();
                        const created = Math.floor(Date.now() / 1000);
                        let accumulatedContent = '';
                        for await (const chunk of stream) {
                            accumulatedContent += chunk;

                            // Replace tool call syntax with user-friendly messages in real-time
                            let processedChunk = chunk;
                            const toolCallRegex = /\[TOOL_CALL:\s*(\w+)\([^)]*\)\]/g;
                            let match;
                            while ((match = toolCallRegex.exec(chunk)) !== null) {
                                const toolName = match[1];
                                let friendlyMessage = '';
                                switch (toolName) {
                                    case 'search_web':
                                        friendlyMessage = '🔍 Searching the web...';
                                        break;
                                    case 'get_weather':
                                        friendlyMessage = '🌤️ Checking weather information...';
                                        break;
                                    case 'calculate':
                                        friendlyMessage = '🧮 Performing calculations...';
                                        break;
                                    case 'extract_text':
                                        friendlyMessage = '📝 Analyzing text...';
                                        break;
                                    default:
                                        friendlyMessage = `🔧 Using ${toolName}...`;
                                }
                                processedChunk = processedChunk.replace(match[0], friendlyMessage);
                            }

                            const data = JSON.stringify({
                                id, object: 'chat.completion.chunk', created, model: 'pipilot-1-vision',
                                choices: [{ index: 0, delta: { content: processedChunk }, finish_reason: null }]
                            });
                            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                        }

                        // Parse tool calls from accumulated content
                        const toolCalls = parseToolCalls(accumulatedContent);
                        if (toolCalls.length > 0) {
                            const openAIToolCalls = toolCalls.map((tc, index) => ({
                                id: 'call_' + Math.random().toString(36).substring(2, 10),
                                type: 'function',
                                function: {
                                    name: tc.name,
                                    arguments: JSON.stringify({ parsed_params: tc.parameters })
                                }
                            }));

                            const toolCallChunk = JSON.stringify({
                                id, object: 'chat.completion.chunk', created, model: 'pipilot-1-vision',
                                choices: [{
                                    index: 0,
                                    delta: { tool_calls: openAIToolCalls },
                                    finish_reason: 'tool_calls'
                                }]
                            });
                            controller.enqueue(encoder.encode(`data: ${toolCallChunk}\n\n`));
                        }

                        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                        controller.close();

                        // Process billing for streaming response (Vision)
                        if (authContext) {
                            const billingResult = await processBilling({
                                authContext,
                                model: 'pipilot-1-vision',
                                messages: body.messages,
                                responseText: accumulatedContent,
                                endpoint: '/v1/chat/completions',
                                statusCode: 200,
                                responseTimeMs: Date.now() - startTime,
                            });
                            
                            if (billingResult.success) {
                                console.log(`💰 [${requestId}] Vision Streaming - Charged $${billingResult.cost.toFixed(4)}, New Balance: $${billingResult.newBalance?.toFixed(2)}`);
                            }
                        }
                    }
                });
                return new NextResponse(readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } });
            } else {
                const response = await callMistralVision(mistralMessages, body.temperature); // Remove tools/tool_choice

                // Replace tool call syntax with user-friendly messages in content
                let processedContent = response.choices[0].message.content;
                const toolCallRegex = /\[TOOL_CALL:\s*(\w+)\([^)]*\)\]/g;
                let match;
                while ((match = toolCallRegex.exec(processedContent)) !== null) {
                    const toolName = match[1];
                    let friendlyMessage = '';
                    switch (toolName) {
                        case 'search_web':
                            friendlyMessage = '🔍 Searching the web...';
                            break;
                        case 'get_weather':
                            friendlyMessage = '🌤️ Checking weather information...';
                            break;
                        case 'calculate':
                            friendlyMessage = '🧮 Performing calculations...';
                            break;
                        case 'extract_text':
                            friendlyMessage = '📝 Analyzing text...';
                            break;
                        default:
                            friendlyMessage = `🔧 Using ${toolName}...`;
                    }
                    processedContent = processedContent.replace(match[0], friendlyMessage);
                }
                response.choices[0].message.content = processedContent;

                // Parse tool calls from original content (not processed)
                const toolCalls = parseToolCalls(response.choices[0].message.content);
                if (toolCalls.length > 0) {
                    response.choices[0].message.tool_calls = toolCalls.map(tc => ({
                        id: 'call_' + Math.random().toString(36).substring(2, 10),
                        type: 'function',
                        function: {
                            name: tc.name,
                            arguments: JSON.stringify({ parsed_params: tc.parameters })
                        }
                    }));
                    response.choices[0].finish_reason = 'tool_calls';
                }
                return NextResponse.json(transformMistralResponse(response, 'pipilot-1-vision'));
            }
        }

        // 2. Code & Thinking Routing (Codestral) - Use our custom tool format
        if (model === 'pipilot-1-code' || model === 'pipilot-1-thinking') {
            console.log(`💻 ${model === 'pipilot-1-code' ? 'Code' : 'Thinking'} model detected, routing to Codestral`);

            const messages = ensureSystemPrompt(body.messages, model, body.tools);

            if (body.stream) {
                const stream = streamCodestral(messages, body.temperature); // Remove tools/tool_choice
                const encoder = new TextEncoder();
                const readable = new ReadableStream({
                    async start(controller) {
                        const id = generateChatCompletionId();
                        const created = Math.floor(Date.now() / 1000);
                        let accumulatedContent = '';
                        for await (const chunk of stream) {
                            accumulatedContent += chunk;

                            // Replace tool call syntax with user-friendly messages in real-time
                            let processedChunk = chunk;
                            const toolCallRegex = /\[TOOL_CALL:\s*(\w+)\([^)]*\)\]/g;
                            let match;
                            while ((match = toolCallRegex.exec(chunk)) !== null) {
                                const toolName = match[1];
                                let friendlyMessage = '';
                                switch (toolName) {
                                    case 'search_web':
                                        friendlyMessage = '🔍 Searching the web...';
                                        break;
                                    case 'get_weather':
                                        friendlyMessage = '🌤️ Checking weather information...';
                                        break;
                                    case 'calculate':
                                        friendlyMessage = '🧮 Performing calculations...';
                                        break;
                                    case 'extract_text':
                                        friendlyMessage = '📝 Analyzing text...';
                                        break;
                                    default:
                                        friendlyMessage = `🔧 Using ${toolName}...`;
                                }
                                processedChunk = processedChunk.replace(match[0], friendlyMessage);
                            }

                            const data = JSON.stringify({
                                id, object: 'chat.completion.chunk', created, model: model,
                                choices: [{ index: 0, delta: { content: processedChunk }, finish_reason: null }]
                            });
                            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                        }

                        // Parse tool calls from accumulated content
                        const toolCalls = parseToolCalls(accumulatedContent);
                        if (toolCalls.length > 0) {
                            const openAIToolCalls = toolCalls.map((tc, index) => ({
                                id: 'call_' + Math.random().toString(36).substring(2, 10),
                                type: 'function',
                                function: {
                                    name: tc.name,
                                    arguments: JSON.stringify({ parsed_params: tc.parameters })
                                }
                            }));

                            const toolCallChunk = JSON.stringify({
                                id, object: 'chat.completion.chunk', created, model: model,
                                choices: [{
                                    index: 0,
                                    delta: { tool_calls: openAIToolCalls },
                                    finish_reason: 'tool_calls'
                                }]
                            });
                            controller.enqueue(encoder.encode(`data: ${toolCallChunk}\n\n`));
                        }

                        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                        controller.close();

                        // Process billing for streaming response (Code/Thinking)
                        if (authContext) {
                            const billingResult = await processBilling({
                                authContext,
                                model,
                                messages: body.messages,
                                responseText: accumulatedContent,
                                endpoint: '/v1/chat/completions',
                                statusCode: 200,
                                responseTimeMs: Date.now() - startTime,
                            });
                            
                            if (billingResult.success) {
                                console.log(`💰 [${requestId}] ${model} Streaming - Charged $${billingResult.cost.toFixed(4)}, New Balance: $${billingResult.newBalance?.toFixed(2)}`);
                            }
                        }
                    }
                });
                return new NextResponse(readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } });
            } else {
                const response = await callCodestral(messages, body.temperature); // Remove tools/tool_choice

                // Replace tool call syntax with user-friendly messages in content
                let processedContent = response.choices[0].message.content;
                const toolCallRegex = /\[TOOL_CALL:\s*(\w+)\([^)]*\)\]/g;
                let match;
                while ((match = toolCallRegex.exec(processedContent)) !== null) {
                    const toolName = match[1];
                    let friendlyMessage = '';
                    switch (toolName) {
                        case 'search_web':
                            friendlyMessage = '🔍 Searching the web...';
                            break;
                        case 'get_weather':
                            friendlyMessage = '🌤️ Checking weather information...';
                            break;
                        case 'calculate':
                            friendlyMessage = '🧮 Performing calculations...';
                            break;
                        case 'extract_text':
                            friendlyMessage = '📝 Analyzing text...';
                            break;
                        default:
                            friendlyMessage = `🔧 Using ${toolName}...`;
                    }
                    processedContent = processedContent.replace(match[0], friendlyMessage);
                }
                response.choices[0].message.content = processedContent;

                // Parse tool calls from original content (not processed)
                const toolCalls = parseToolCalls(response.choices[0].message.content);
                if (toolCalls.length > 0) {
                    response.choices[0].message.tool_calls = toolCalls.map(tc => ({
                        id: 'call_' + Math.random().toString(36).substring(2, 10),
                        type: 'function',
                        function: {
                            name: tc.name,
                            arguments: JSON.stringify({ parsed_params: tc.parameters })
                        }
                    }));
                    response.choices[0].finish_reason = 'tool_calls';
                }
                return NextResponse.json(transformMistralResponse(response, model));
            }
        }

        // 3. General Chat & Thinking (a0.dev)
        console.log(`💬 Routing to a0.dev for model: ${model}`);
        const a0Request = transformRequest(body, model);
        console.log('📤 Request body to a0.dev:', JSON.stringify(a0Request, null, 2));

        const response = await fetch('https://api.a0.dev/ai/llm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(a0Request)
        });

        if (!response.ok) {
            const errorText = await response.text();
            // Log the actual error internally but don't expose it
            console.error(`a0.dev API error (${response.status}):`, errorText);
            throw new Error(`API_ERROR_${response.status}`);
        }

        const data: A0DevResponse = await response.json();
        let transformed = transformResponse(data, model, body.tools);

        // Handle tool execution for models that don't support native tool calling
        if (transformed.choices[0].message.tool_calls && transformed.choices[0].message.tool_calls.length > 0) {
            console.log('Tool calls detected...');

            // Check if this is ONLY builtin tools (like search_web) that we execute server-side
            const hasOnlyBuiltinTools = transformed.choices[0].message.tool_calls.every((tc: any) =>
                tc.function.name === 'search_web'  // Add other builtin tools here
            );

            if (hasOnlyBuiltinTools && transformed.choices[0].message.tool_calls.length === 1 &&
                transformed.choices[0].message.tool_calls[0].function.name === 'search_web') {
                // Handle builtin web search directly on server - no follow-up API call needed
                const searchToolCall = transformed.choices[0].message.tool_calls[0];
                const searchResult = await executeToolManually({
                    name: 'search_web',
                    parameters: JSON.parse(searchToolCall.function.arguments).parsed_params
                }, body.tools || []);

                // Generate final response directly on server
                const searchQuery = searchResult.query || 'your search query';
                const results = searchResult.results || [];
                const totalResults = searchResult.total_results || 0;

                let finalContent = `I searched for "${searchQuery}" and found ${totalResults} results:\n\n`;

                if (results.length > 0) {
                    results.forEach((result: any, index: number) => {
                        finalContent += `${index + 1}. **${result.title}**\n`;
                        finalContent += `   ${result.content}\n`;
                        finalContent += `   *URL: ${result.url}*\n\n`;
                    });
                } else if (searchResult.error) {
                    finalContent += `❌ Search failed: ${searchResult.error}\n\n`;
                    finalContent += `Please try rephrasing your search query.`;
                } else {
                    finalContent += `No results found for "${searchQuery}". Try a different search term.`;
                }

                // Return the final response directly
                const finalResponse = {
                    id: generateChatCompletionId(),
                    object: 'chat.completion',
                    created: Math.floor(Date.now() / 1000),
                    model: model,
                    choices: [{
                        index: 0,
                        message: {
                            role: 'assistant',
                            content: finalContent
                        },
                        finish_reason: 'stop'
                    }],
                    usage: {
                        prompt_tokens: 0,
                        completion_tokens: 0,
                        total_tokens: 0
                    }
                };

                return NextResponse.json(finalResponse);
            } else {
                // For custom tools (not builtin), return tool calls to client for execution
                // Client will execute and send results back in subsequent request
                console.log('Returning tool calls to client for custom tool execution...');

                // Don't execute tools server-side - let client handle custom tools
                // Just return the response with tool_calls so client can execute them
            }
        }

        if (body.stream) {
            // Simulate streaming for a0.dev (which is non-streaming)
            const encoder = new TextEncoder();
            const readable = new ReadableStream({
                async start(controller) {
                    // If it's a tool call, we don't stream word by word, just send it all at once
                    if (transformed.choices[0].message.tool_calls) {
                        const toolCallsWithIndex = transformed.choices[0].message.tool_calls.map((tc: any, i: number) => ({
                            ...tc,
                            index: i
                        }));
                        const chunk = JSON.stringify({
                            id: transformed.id, object: 'chat.completion.chunk', created: transformed.created, model: model,
                            choices: [{ index: 0, delta: { tool_calls: toolCallsWithIndex }, finish_reason: null }]
                        });
                        controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
                    } else {
                        const content = transformed.choices[0].message.content || '';
                        const words = content.split(' ');
                        for (const word of words) {
                            const chunk = JSON.stringify({
                                id: transformed.id, object: 'chat.completion.chunk', created: transformed.created, model: model,
                                choices: [{ index: 0, delta: { content: word + ' ' }, finish_reason: null }]
                            });
                            controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
                            await new Promise(r => setTimeout(r, 10));
                        }
                    }
                    const doneChunk = JSON.stringify({
                        id: transformed.id, object: 'chat.completion.chunk', created: transformed.created, model: model,
                        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
                    });
                    controller.enqueue(encoder.encode(`data: ${doneChunk}\n\n`));
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                    controller.close();

                    // Process billing for streaming response (Chat)
                    if (authContext) {
                        const billingResult = await processBilling({
                            authContext,
                            model,
                            messages: body.messages,
                            responseText: transformed.choices[0].message.content || '',
                            endpoint: '/v1/chat/completions',
                            statusCode: 200,
                            responseTimeMs: Date.now() - startTime,
                        });
                        
                        if (billingResult.success) {
                            console.log(`💰 [${requestId}] ${model} Streaming - Charged $${billingResult.cost.toFixed(4)}, New Balance: $${billingResult.newBalance?.toFixed(2)}`);
                        }
                    }
                }
            });
            return new NextResponse(readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } });
        }

        // Extract response text for billing
        responseText = transformed.choices[0].message.content || '';
        
        // Process billing (async - don't block response)
        if (authContext) {
            const billingResult = await processBilling({
                authContext,
                model,
                messages: body.messages,
                responseText,
                endpoint: '/v1/chat/completions',
                statusCode: 200,
                responseTimeMs: Date.now() - startTime,
            });
            
            if (billingResult.success) {
                console.log(`💰 [${requestId}] Charged $${billingResult.cost.toFixed(4)}, New Balance: $${billingResult.newBalance?.toFixed(2)}`);
            }
        }

        return NextResponse.json(transformed);

    } catch (error: any) {
        // Log failed request (no charge)
        if (authContext && requestBody) {
            await processBilling({
                authContext,
                model: requestBody.model || 'pipilot-1-chat',
                messages: requestBody.messages || [],
                responseText: '',
                endpoint: '/v1/chat/completions',
                statusCode: 500,
                responseTimeMs: Date.now() - startTime,
                errorMessage: error.message,
            });
        }
        
        const apiError = handleAPIError(error, 'POST /api/v1/chat/completions', requestId);

        // Determine appropriate HTTP status code
        let statusCode = 500;
        if (apiError.type === 'invalid_request_error') {
            statusCode = 400;
        } else if (apiError.type === 'auth_error') {
            statusCode = 401;
        } else if (apiError.type === 'rate_limit_error') {
            statusCode = 429;
        }

        console.error(`❌ [${requestId}] API Error (${apiError.code}):`, {
            message: apiError.message,
            type: apiError.type,
            duration: Date.now() - startTime,
            model: requestBody?.model,
            messageCount: requestBody?.messages?.length
        });

        return NextResponse.json(
            { error: apiError },
            {
                status: statusCode,
                headers: {
                    'X-Request-ID': requestId,
                    'X-Error-Code': apiError.code
                }
            }
        );
    }
}

export async function OPTIONS(request: NextRequest) {
    return new NextResponse(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}
