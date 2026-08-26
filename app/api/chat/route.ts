import { streamText, generateText, tool, stepCountIs } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getModel } from '@/lib/ai-providers'
import { DEFAULT_CHAT_MODEL, getModelById } from '@/lib/ai-models'

// Global user ID for tool access
declare global {
  var currentUserId: string
}

// Use Node.js runtime for full IndexedDB and file system access
// export const runtime = 'edge' // Removed: Edge runtime doesn't support IndexedDB

// Get AI model by ID with fallback to default
const getAIModel = (modelId?: string) => {
  try {
    const selectedModelId = modelId || DEFAULT_CHAT_MODEL
    const modelInfo = getModelById(selectedModelId)
    
    if (!modelInfo) {
      console.warn(`Model ${selectedModelId} not found, using default: ${DEFAULT_CHAT_MODEL}`)
      return getModel(DEFAULT_CHAT_MODEL)
    }
    
    console.log(`Using AI model: ${modelInfo.name} (${modelInfo.provider})`)
    return getModel(selectedModelId)
  } catch (error) {
    console.error('Failed to get AI model:', error)
    console.log(`Falling back to default model: ${DEFAULT_CHAT_MODEL}`)
    return getModel(DEFAULT_CHAT_MODEL)
  }
}

// Get Mistral Pixtral model for NLP and intent detection
const getMistralPixtralModel = () => {
  try {
    return getModel('pixtral-12b-2409')
  } catch (error) {
    console.warn('Mistral Pixtral model not available, falling back to default')
    return getModel(DEFAULT_CHAT_MODEL)
  }
}

// JSON File Operation Interface for Memory System
interface JSONFileOperation {
  jsonTool: 'write_file' | 'edit_file' | 'delete_file'
  filePath: string
  fileName: string
  purpose: string
  changeSummary: string
  contentPreview?: string
  searchReplacePattern?: {
    search: string
    replace: string
  }
  searchReplaceBlocks?: Array<{
    oldCode: string
    newCode: string
  }>
  timestamp: string
  extractedFromResponse: boolean
  toolCallId?: string
}

// Enhanced Memory System for AI Context Awareness (JSON-Based)
interface AIStreamMemory {
  id: string
  timestamp: string
  projectId: string
  userId: string
  userMessage: string
  aiResponse?: string
  jsonOperations: JSONFileOperation[]
  conversationContext: {
    semanticSummary: string
    keyInsights: string[]
    technicalPatterns: string[]
    architecturalDecisions: string[]
    nextLogicalSteps: string[]
    potentialImprovements: string[]
    relevanceScore: number
    contextForFuture: string
  }
  patterns: {
    duplicateActions: string[]
    fileAccessPatterns: string[]
    userIntentPatterns: string[]
    jsonToolPatterns: string[]
  }
  actionSummary: {
    filesCreated: string[]
    filesModified: string[]
    filesDeleted: string[]
    mainPurpose: string
    keyChanges: string[]
  }
}

// Memory Storage for streaming API
const aiStreamMemoryStore = new Map<string, AIStreamMemory[]>() // projectId -> memory array

// Extract pre-tool-call descriptions and JSON operations from AI response
function extractContextAndOperationsFromResponse(aiResponse: string, toolCalls?: any[]): {
  operations: JSONFileOperation[]
  preToolDescriptions: string[]
  overallPurpose: string
} {
  const operations: JSONFileOperation[] = []
  const preToolDescriptions: string[] = []
  const timestamp = new Date().toISOString()

  // Extract text before JSON tool calls - this contains the AI's description of what it will do
  const jsonBlockRegex = /```json\s*\n([\s\S]*?)\n```/gi
  let lastIndex = 0
  let match

  while ((match = jsonBlockRegex.exec(aiResponse)) !== null) {
    // Extract text before this JSON block
     const textBeforeBlock = aiResponse.substring(lastIndex, match.index).trim()
    if (textBeforeBlock) {
      // Clean up the description - remove excessive whitespace and normalize
      const cleanDescription = textBeforeBlock
        .replace(/\n{3,}/g, '\n\n') // Replace 3+ newlines with 2
        .replace(/^\s*[-*+]\s*/gm, '') // Remove list markers
        .replace(/^\s*\d+\.\s*/gm, '') // Remove numbered list markers
        .trim()

      if (cleanDescription.length > 10) { // Only include substantial descriptions
        preToolDescriptions.push(cleanDescription)
      }
    }
    lastIndex = match.index + match[0].length
  }

  // Extract overall purpose from the beginning of the response (before any tool calls)
  const overallPurpose = aiResponse.split(/```json/)[0]?.trim() || 'Development work'

  // If we have actual tool calls from the AI stream, use those
  if (toolCalls && toolCalls.length > 0) {
    toolCalls.forEach((toolCall, index) => {
      if (toolCall.toolName && ['write_file', 'edit_file', 'delete_file'].includes(toolCall.toolName)) {
        const args = toolCall.args || {}
        const filePath = args.path || ''

        if (filePath) {
          // Use pre-tool description as purpose if available
          const descriptionIndex = Math.min(index, preToolDescriptions.length - 1)
          const purposeFromDescription = preToolDescriptions[descriptionIndex] ||
            inferPurposeFromTool(toolCall.toolName, args, filePath)

          const operation: JSONFileOperation = {
            jsonTool: toolCall.toolName as 'write_file' | 'edit_file' | 'delete_file',
            filePath,
            fileName: filePath.split('/').pop() || filePath,
            purpose: purposeFromDescription,
            changeSummary: generateChangeSummary(toolCall.toolName, filePath, args),
            timestamp,
            extractedFromResponse: false,
            toolCallId: toolCall.toolCallId
          }

          // Add content preview for write/edit operations
          if (args.content) {
            operation.contentPreview = args.content.substring(0, 200) + (args.content.length > 200 ? '...' : '')
          }

          // Add search/replace patterns for edit operations
          if (toolCall.toolName === 'edit_file' && args.searchReplaceBlocks) {
            operation.searchReplaceBlocks = args.searchReplaceBlocks.map((block: any) => ({
              oldCode: block.oldCode || block.search || '',
              newCode: block.newCode || block.replace || ''
            }))
          }

          operations.push(operation)
        }
      }
    })
  }

  // Fallback: Parse JSON tool calls from response text (for backward compatibility)
  if (operations.length === 0) {
    // Look for JSON code blocks that contain tool calls
    const jsonBlocks = aiResponse.match(/```json\s*\n([\s\S]*?)\n```/gi)
    if (jsonBlocks) {
      jsonBlocks.forEach((block, index) => {
        try {
          const jsonContent = block.replace(/```json\s*\n?/, '').replace(/\n?```/, '').trim()
          const parsed = JSON.parse(jsonContent)

          if (parsed.tool && ['write_file', 'edit_file', 'delete_file'].includes(parsed.tool) && parsed.path) {
            // Use pre-tool description as purpose if available
            const descriptionIndex = Math.min(index, preToolDescriptions.length - 1)
            const purposeFromDescription = preToolDescriptions[descriptionIndex] ||
              inferPurposeFromTool(parsed.tool, parsed, parsed.path)

            operations.push({
              jsonTool: parsed.tool as 'write_file' | 'edit_file' | 'delete_file',
              filePath: parsed.path,
              fileName: parsed.path.split('/').pop() || parsed.path,
              purpose: purposeFromDescription,
              changeSummary: generateChangeSummary(parsed.tool, parsed.path, parsed),
              contentPreview: parsed.content ? parsed.content.substring(0, 200) + (parsed.content.length > 200 ? '...' : '') : undefined,
              searchReplaceBlocks: parsed.searchReplaceBlocks,
              timestamp,
              extractedFromResponse: true
            })
          }
        } catch (error) {
          // Ignore invalid JSON blocks
        }
      })
    }
  }

  return {
    operations,
    preToolDescriptions,
    overallPurpose
  }
}

// Legacy function for backward compatibility
function extractJSONOperationsFromResponse(aiResponse: string, toolCalls?: any[]): JSONFileOperation[] {
  return extractContextAndOperationsFromResponse(aiResponse, toolCalls).operations
}

// Helper function to infer purpose from JSON tool
function inferPurposeFromTool(toolName: string, args: any, filePath: string): string {
  const fileExt = filePath.split('.').pop()?.toLowerCase()
  
  switch (toolName) {
    case 'write_file':
      const content = args.content || ''
      // Analyze content for patterns
      if (content.includes('export default') || content.includes('export function')) {
        return `Create/update ${fileExt} component or utility`
      }
      if (content.includes('interface ') || content.includes('type ')) {
        return `Define TypeScript types and interfaces`
      }
      if (content.includes('useState') || content.includes('useEffect')) {
        return `Create React component with hooks`
      }
      if (content.includes('API') || content.includes('fetch') || content.includes('POST')) {
        return `Implement API functionality`
      }
      if (content.includes('style') || content.includes('className')) {
        return `Add styling and UI elements`
      }
      return `Create/update ${fileExt} file`
      
    case 'edit_file':
      const blocks = args.searchReplaceBlocks || []
      if (blocks.length > 0) {
        const firstBlock = blocks[0]
        const oldCode = firstBlock.oldCode || firstBlock.search || ''
        const newCode = firstBlock.newCode || firstBlock.replace || ''
        
        if (oldCode.includes('function') && newCode.includes('function')) {
          return `Modify function logic in ${filePath}`
        }
        if (oldCode.includes('import') || newCode.includes('import')) {
          return `Update imports in ${filePath}`
        }
        if (oldCode.includes('interface') || newCode.includes('interface')) {
          return `Update type definitions in ${filePath}`
        }
        if (oldCode.includes('style') || newCode.includes('className')) {
          return `Update styling in ${filePath}`
        }
      }
      return `Edit content in ${filePath}`
      
    case 'delete_file':
      return `Delete file: ${filePath}`
      
    case 'delete_folder':
      return `Delete folder: ${filePath}`
      
    default:
      return `Update ${fileExt} file`
  }
}

// Helper function to generate change summary
function generateChangeSummary(toolName: string, filePath: string, args: any): string {
  const fileName = filePath.split('/').pop() || filePath
  
  switch (toolName) {
    case 'write_file':
      const content = args.content || ''
      const lines = content.split('\n').length
      return `Create/update ${fileName} (${lines} lines)`
      
    case 'edit_file':
      const blocks = args.searchReplaceBlocks || []
      if (blocks.length > 0) {
        const summary = blocks.map((block: any, i: number) => {
          const oldCode = (block.oldCode || block.search || '').substring(0, 50)
          const newCode = (block.newCode || block.replace || '').substring(0, 50)
          return `${i + 1}: ${oldCode}... → ${newCode}...`
        }).join('; ')
        return `Edit ${fileName}: ${summary}`
      }
      return `Edit ${fileName}`
      
    case 'delete_file':
      return `Delete ${fileName}`
      
    case 'delete_folder':
      return `Delete folder ${fileName}`
      
    default:
      return `${toolName} ${fileName}`
  }
}

// Simplified Memory Processing - No AI dependency, just track user message and files affected
function processStreamMemorySimple(
  userMessage: string,
  jsonOperations: JSONFileOperation[]
): {
  semanticSummary: string
  keyInsights: string[]
  technicalPatterns: string[]
  architecturalDecisions: string[]
  nextLogicalSteps: string[]
  potentialImprovements: string[]
  relevanceScore: number
  contextForFuture: string
  duplicateActions: string[]
  fileAccessPatterns: string[]
  mainPurpose: string
  keyChanges: string[]
} {
  // Simple format: just track what user said and files affected
  const filesAffected = jsonOperations.map(op => `${op.jsonTool}:${op.filePath}`)

  const semanticSummary = filesAffected.length > 0
    ? `UserMessage in last request: ${userMessage}

Note: Changes you made and files you modified  to compleett the request are listed below
filesAffected: [
${filesAffected.map(f => `  "${f}"`).join(',\n')}
]`
    : `UserMessage in last request: ${userMessage}

Note: No files were affected in the last request`

  const keyChanges = jsonOperations.map(op => op.changeSummary)

  return {
    semanticSummary,
    keyInsights: ['Simple memory tracking - no AI analysis'],
    technicalPatterns: ['Direct file operation tracking'],
    architecturalDecisions: ['Simplified memory system'],
    nextLogicalSteps: [],
    potentialImprovements: [],
    relevanceScore: 1.0,
    contextForFuture: semanticSummary,
    duplicateActions: [],
    fileAccessPatterns: filesAffected,
    mainPurpose: userMessage,
    keyChanges: keyChanges
  }
}

// Function to store memory and provide context awareness
async function storeStreamMemory(
  projectId: string,
  userId: string,
  userMessage: string,
  aiResponse: string,
  projectContext: string
): Promise<AIStreamMemory> {
  // Extract JSON operations AND pre-tool-call descriptions from AI response only
  // Note: Tools are executed on frontend during streaming, so we only track from AI response text
  const { operations: jsonOperations, preToolDescriptions, overallPurpose } = extractContextAndOperationsFromResponse(aiResponse)

  // Process memory with simple tracking - no AI dependency
  const memoryAnalysis = processStreamMemorySimple(
    userMessage,
    jsonOperations
  )

  // Create memory record
  const memory: AIStreamMemory = {
    id: `memory_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    projectId,
    userId,
    userMessage,
    aiResponse,
    jsonOperations,
    conversationContext: {
      semanticSummary: memoryAnalysis.semanticSummary,
      keyInsights: memoryAnalysis.keyInsights,
      technicalPatterns: memoryAnalysis.technicalPatterns,
      architecturalDecisions: memoryAnalysis.architecturalDecisions,
      nextLogicalSteps: memoryAnalysis.nextLogicalSteps,
      potentialImprovements: memoryAnalysis.potentialImprovements,
      relevanceScore: memoryAnalysis.relevanceScore,
      contextForFuture: memoryAnalysis.contextForFuture
    },
    patterns: {
      duplicateActions: memoryAnalysis.duplicateActions,
      fileAccessPatterns: memoryAnalysis.fileAccessPatterns,
      userIntentPatterns: [extractUserIntentPattern(userMessage)],
      jsonToolPatterns: jsonOperations.map((op: JSONFileOperation) => `${op.jsonTool}:${op.fileName}`)
    },
    actionSummary: {
      filesCreated: jsonOperations.filter((op: JSONFileOperation) => op.jsonTool === 'write_file').map((op: JSONFileOperation) => op.filePath),
      filesModified: jsonOperations.filter((op: JSONFileOperation) => op.jsonTool === 'edit_file').map((op: JSONFileOperation) => op.filePath),
      filesDeleted: jsonOperations.filter((op: JSONFileOperation) => op.jsonTool === 'delete_file').map((op: JSONFileOperation) => op.filePath),
      mainPurpose: memoryAnalysis.mainPurpose,
      keyChanges: memoryAnalysis.keyChanges
    }
  }

  // Store memory
  const memories = aiStreamMemoryStore.get(projectId) || []
  memories.push(memory)

  // Keep only last 50 memories to prevent memory bloat
  if (memories.length > 50) {
    memories.splice(0, memories.length - 50)
  }

  aiStreamMemoryStore.set(projectId, memories)

  return memory
}// Helper function to extract user intent pattern
function extractUserIntentPattern(userMessage: string): string {
  const message = userMessage.toLowerCase()
  
  if (message.includes('create') || message.includes('build') || message.includes('make')) {
    return 'creation_intent'
  }
  if (message.includes('fix') || message.includes('bug') || message.includes('error')) {
    return 'fix_intent'
  }
  if (message.includes('update') || message.includes('modify') || message.includes('change')) {
    return 'modification_intent'
  }
  if (message.includes('delete') || message.includes('remove')) {
    return 'deletion_intent'
  }
  if (message.includes('help') || message.includes('how') || message.includes('?')) {
    return 'help_intent'
  }
  
  return 'general_intent'
}

// Function to get context for preventing duplicates
function getStreamContextForRequest(projectId: string, userMessage: string): {
  previousActions: string[]
  suggestedApproach: string
  potentialDuplicates: string[]
  relevantMemories: AIStreamMemory[]
  currentProjectState: {
    filesCreated: string[]
    filesModified: string[]
    filesDeleted: string[]
    recentChanges: string[]
    totalOperations: number
  }
} {
  const memories = aiStreamMemoryStore.get(projectId) || []
  const recentMemories = memories.slice(-10) // Last 10 interactions

  // Check for potential duplicates
  const currentIntent = extractUserIntentPattern(userMessage)
  const potentialDuplicates: string[] = []
  const previousActions: string[] = []

  // Track current project state
  const filesCreated = new Set<string>()
  const filesModified = new Set<string>()
  const filesDeleted = new Set<string>()
  const recentChanges: string[] = []
  let totalOperations = 0

  recentMemories.forEach(memory => {
    // Check for similar intents
    if (memory.patterns.userIntentPatterns.includes(currentIntent)) {
      potentialDuplicates.push(`Similar ${currentIntent} request: "${memory.userMessage}"`)
    }

    // Collect detailed previous actions with clear context
    memory.jsonOperations.forEach(op => {
      const actionDetail = `**${op.jsonTool.toUpperCase()}**: ${op.filePath}
      **Purpose**: ${op.purpose}
      **What was changed**: ${op.changeSummary}${op.contentPreview ? `\n      **Content**: ${op.contentPreview}` : ''}`
      previousActions.push(actionDetail)

      // Track project state
      if (op.jsonTool === 'write_file') {
        filesCreated.add(op.filePath)
      } else if (op.jsonTool === 'edit_file') {
        filesModified.add(op.filePath)
      } else if (op.jsonTool === 'delete_file') {
        filesDeleted.add(op.filePath)
      }

      totalOperations++
    })

    // Add recent changes summary
    if (memory.actionSummary.mainPurpose) {
      recentChanges.push(`${memory.timestamp}: ${memory.actionSummary.mainPurpose} (${memory.jsonOperations.length} operations)`)
    }
  })

  // Generate suggested approach
  const suggestedApproach = potentialDuplicates.length > 0
    ? `Consider reviewing previous similar work before proceeding: ${potentialDuplicates[0]}`
    : 'Proceed with implementation based on request'

  return {
    previousActions: [...new Set(previousActions)], // Remove duplicates
    suggestedApproach,
    potentialDuplicates,
    relevantMemories: recentMemories.filter(m => m.conversationContext.relevanceScore > 0.6),
    currentProjectState: {
      filesCreated: Array.from(filesCreated),
      filesModified: Array.from(filesModified),
      filesDeleted: Array.from(filesDeleted),
      recentChanges: recentChanges.slice(-5), // Last 5 changes
      totalOperations
    }
  }
}

// Helper function to view memory state (for debugging)
export function getMemoryState(projectId: string): {
  totalMemories: number
  recentMemories: AIStreamMemory[]
  memoryStats: {
    totalJSONOperations: number
    filesCreated: number
    filesModified: number
    filesDeleted: number
    averageRelevanceScore: number
  }
} {
  const memories = aiStreamMemoryStore.get(projectId) || []
  const recentMemories = memories.slice(-10)
  
  let totalJSONOperations = 0
  let filesCreated = 0
  let filesModified = 0
  let filesDeleted = 0
  let totalRelevanceScore = 0
  
  memories.forEach(memory => {
    totalJSONOperations += memory.jsonOperations.length
    filesCreated += memory.actionSummary.filesCreated.length
    filesModified += memory.actionSummary.filesModified.length
    filesDeleted += memory.actionSummary.filesDeleted.length
    totalRelevanceScore += memory.conversationContext.relevanceScore
  })
  
  return {
    totalMemories: memories.length,
    recentMemories,
    memoryStats: {
      totalJSONOperations,
      filesCreated,
      filesModified,
      filesDeleted,
      averageRelevanceScore: memories.length > 0 ? totalRelevanceScore / memories.length : 0
    }
  }
}

// Add Tavily API configuration with environment variable support
const tavilyConfig = {
  apiKeys: (process.env.TAVILY_API_KEYS || '').split(',').filter(Boolean),
  searchUrl: 'https://api.tavily.com/search',
  extractUrl: 'https://api.tavily.com/extract',
  currentKeyIndex: 0
};

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
        max_results: 3
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

// Clean and format extracted content for better AI consumption
function cleanExtractedContent(content: any[], urls: string[]): string {
  if (!content || content.length === 0) {
    return `No content extracted from URLs: ${urls.join(', ')}`
  }

  let cleanedText = `📄 **Content Extraction Results**\n\n`
  
  content.forEach((item, index) => {
    const url = item.url || urls[index] || 'Unknown URL'
    const title = item.title || 'Untitled'
    const text = item.text || item.raw_content || 'No content available'
    
    // Clean and truncate content to fit within 1500 chars total
    const maxContentPerItem = Math.floor(1500 / content.length)
    const cleanedItemText = text
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/\n+/g, ' ') // Replace multiple newlines with single space
      .trim()
      .substring(0, maxContentPerItem)
    
    cleanedText += `**${index + 1}. ${title}**\n`
    cleanedText += `🔗 ${url}\n`
    cleanedText += `${cleanedItemText}${cleanedItemText.length >= maxContentPerItem ? '...' : ''}\n\n`
  })
  
  // Ensure total length doesn't exceed 1500 characters
  if (cleanedText.length > 1500) {
    cleanedText = cleanedText.substring(0, 1497) + '...'
  }
  
  return cleanedText
}

// Content extraction function using Tavily API
async function extractContent(urls: string | string[]) {
  // Check if API keys are available
  if (tavilyConfig.apiKeys.length === 0) {
    throw new Error('No Tavily API keys are configured.');
  }
  
  try {
    // Ensure urls is always an array
    const urlArray = Array.isArray(urls) ? urls : [urls];
    
    // Rotate through available API keys
    const apiKey = tavilyConfig.apiKeys[tavilyConfig.currentKeyIndex];
    tavilyConfig.currentKeyIndex = (tavilyConfig.currentKeyIndex + 1) % tavilyConfig.apiKeys.length;
    
    console.log('Starting content extraction for:', urlArray);
    const response = await fetch('https://api.tavily.com/extract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        urls: urlArray,
        include_images: false,
        extract_depth: "basic"
      })
    });

    if (!response.ok) {
      throw new Error(`Content extraction failed with status ${response.status}`);
    }

    const data = await response.json();
    
    // Clean and format extracted content for AI consumption
    const cleanedContent = cleanExtractedContent(data.content || [], urlArray)
    
    console.log('Content extraction successful (cleaned and formatted):', {
      urlCount: urlArray.length,
      contentCount: data.content?.length || 0,
      cleanedLength: cleanedContent.length
    })
    
    return {
      rawData: data,
      cleanedContent: cleanedContent,
      urls: urlArray,
      contentCount: data.content?.length || 0
    }
  } catch (error) {
    console.error('Content extraction error:', error);
    throw error;
  }
}

// File operation tools using storage manager
async function executeWriteFile(projectId: string, path: string, content: string, userId: string, storageManager: any) {
  try {
    // Check if file already exists
    const existingFile = await storageManager.getFile(projectId, path)

    if (existingFile) {
      // Update existing file
      await storageManager.updateFile(projectId, path, { content })
      return { success: true, message: `File ${path} updated successfully.` }
    } else {
      // Create new file
      const newFile = {
        workspaceId: projectId,
        name: path.split('/').pop() || path,
        path,
        content,
        fileType: path.split('.').pop() || 'text',
        type: path.split('.').pop() || 'text',
        size: content.length,
        isDirectory: false
      }
      
      await storageManager.createFile(newFile)
      return { success: true, message: `File ${path} created successfully.` }
    }
  } catch (error) {
    return { success: false, error: `Error creating file: ${error}` }
  }
}

// Search/Replace constants for file editing
const SEARCH_START = "<<<<<<< SEARCH";
const DIVIDER = "=======";
const REPLACE_END = ">>>>>>> REPLACE";

// Helper function to escape special regex characters
function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Parse AI response into search/replace blocks
function parseSearchReplaceBlocks(aiResponse: string) {
  const blocks: Array<{search: string, replace: string}> = [];
  const lines = aiResponse.split('\n');
  
  let currentBlock: {search: string[], replace: string[]} | null = null;
  let mode: 'none' | 'search' | 'replace' = 'none';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.trim() === SEARCH_START) {
      currentBlock = { search: [], replace: [] };
      mode = 'search';
    } else if (line.trim() === DIVIDER && currentBlock) {
      mode = 'replace';
    } else if (line.trim() === REPLACE_END && currentBlock) {
      blocks.push({
        search: currentBlock.search.join('\n'),
        replace: currentBlock.replace.join('\n')
      });
      currentBlock = null;
      mode = 'none';
    } else if (mode === 'search' && currentBlock) {
      currentBlock.search.push(line);
    } else if (mode === 'replace' && currentBlock) {
      currentBlock.replace.push(line);
    }
  }
  
  return blocks;
}

// Apply search/replace edits to content
function applySearchReplaceEdits(content: string, blocks: Array<{search: string, replace: string}>) {
  let modifiedContent = content;
  const appliedEdits: Array<{
    blockIndex: number;
    search: string;
    replace: string;
    status: string;
  }> = [];
  const failedEdits: Array<{
    blockIndex: number;
    search: string;
    replace: string;
    status: string;
    reason: string;
  }> = [];
  
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const searchText = block.search;
    const replaceText = block.replace;
    
    if (modifiedContent.includes(searchText)) {
      modifiedContent = modifiedContent.replace(searchText, replaceText);
      appliedEdits.push({
        blockIndex: i,
        search: searchText,
        replace: replaceText,
        status: 'applied'
      });
    } else {
      failedEdits.push({
        blockIndex: i,
        search: searchText,
        replace: replaceText,
        status: 'failed',
        reason: 'Search text not found in content'
      });
    }
  }
  
  return { modifiedContent, appliedEdits, failedEdits };
}

async function executeReadFile(projectId: string, path: string, userId: string, storageManager: any) {
  try {
    const file = await storageManager.getFile(projectId, path)

    if (!file) {
      return { success: false, error: `File not found: ${path}` }
    }

    return { 
      success: true, 
      content: file.content || '', 
      name: file.name,
      type: file.type,
      message: `File read: ${path}` 
    }
  } catch (error) {
    return { success: false, error: `Failed to read file: ${error}` }
  }
}

async function executeListFiles(projectId: string, userId: string, storageManager: any) {
  try {
    const files = await storageManager.getFiles(projectId)

    return { 
      success: true, 
      files: files.map((file: any) => ({
        path: file.path,
        name: file.name,
        type: file.type,
        created_at: file.createdAt
      })), 
      message: `Found ${files.length} files in project` 
    }
  } catch (error) {
    return { success: false, error: `Failed to list files: ${error}` }
  }
}

async function executeDeleteFile(projectId: string, path: string, userId: string, storageManager: any) {
  try {
    await storageManager.deleteFile(projectId, path)

    return { success: true, message: `File deleted: ${path}` }
  } catch (error) {
    return { success: false, error: `Failed to delete file: ${error}` }
  }
}

// ENHANCED: File tree context builder with selective full content
async function buildOptimizedProjectContext(projectId: string, storageManager: any, userIntent?: any) {
  try {
    const files = await storageManager.getFiles(projectId)
    
    // Get current time and working directory for context
    const currentTime = new Date().toLocaleString('en-US', {
      timeZone: 'Africa/Douala',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'long'
    })

    // Filter out shadcn UI components and common excluded files
    const filteredFiles = files.filter((file: any) => {
      const path = file.path.toLowerCase()
      // Exclude shadcn UI components
      if (path.includes('components/ui/') && (
        path.includes('button.tsx') ||
        path.includes('input.tsx') ||
        path.includes('dialog.tsx') ||
        path.includes('card.tsx') ||
        path.includes('badge.tsx') ||
        path.includes('alert.tsx') ||
        path.includes('accordion.tsx') ||
        path.includes('avatar.tsx') ||
        path.includes('checkbox.tsx') ||
        path.includes('dropdown-menu.tsx') ||
        path.includes('form.tsx') ||
        path.includes('label.tsx') ||
        path.includes('select.tsx') ||
        path.includes('sheet.tsx') ||
        path.includes('tabs.tsx') ||
        path.includes('textarea.tsx') ||
        path.includes('toast.tsx') ||
        path.includes('tooltip.tsx') ||
        path.includes('separator.tsx') ||
        path.includes('skeleton.tsx') ||
        path.includes('scroll-area.tsx') ||
        path.includes('progress.tsx') ||
        path.includes('popover.tsx') ||
        path.includes('navigation-menu.tsx') ||
        path.includes('menubar.tsx') ||
        path.includes('hover-card.tsx') ||
        path.includes('command.tsx') ||
        path.includes('calendar.tsx') ||
        path.includes('table.tsx') ||
        path.includes('switch.tsx') ||
        path.includes('slider.tsx') ||
        path.includes('radio-group.tsx')
      )) {
        return false
      }
      
      // Exclude node_modules, .git, build outputs
      if (path.includes('node_modules') || 
          path.includes('.git/') || 
          path.includes('dist/') || 
          path.includes('build/') ||
          path.includes('.next/')) {
        return false
      }
      
      return true
    })

    // Detect project type (Vite or Next.js)
    const hasNextConfig = files.some((f: any) => f.path === 'next.config.js' || f.path === 'next.config.mjs')
    const hasViteConfig = files.some((f: any) => f.path === 'vite.config.ts' || f.path === 'vite.config.js')
    const projectType = hasNextConfig ? 'nextjs' : hasViteConfig ? 'vite-react' : 'unknown'

    // Build file tree structure
    const fileTree: string[] = []
    const directories = new Set<string>()
    
    // Sort files for better organization
    const sortedFiles = filteredFiles.sort((a: any, b: any) => {
      return a.path.localeCompare(b.path)
    })

    // Collect all directories
    sortedFiles.forEach((file: any) => {
      const pathParts = file.path.split('/')
      if (pathParts.length > 1) {
        // Add all parent directories
        for (let i = 1; i < pathParts.length; i++) {
          const dirPath = pathParts.slice(0, i).join('/')
          if (dirPath) {
            directories.add(dirPath)
          }
        }
      }
    })

    // Add root files first
    const rootFiles = sortedFiles.filter((file: any) => !file.path.includes('/'))
    rootFiles.forEach((file: any) => {
      fileTree.push(file.path)
    })

    // Add directories and their files
    const sortedDirectories = Array.from(directories).sort()
    sortedDirectories.forEach((dir: string) => {
      fileTree.push(`${dir}/`)
      
      // Add files in this directory
      const dirFiles = sortedFiles.filter((file: any) => {
        const filePath = file.path
        const fileDir = filePath.substring(0, filePath.lastIndexOf('/'))
        return fileDir === dir
      })
      
      dirFiles.forEach((file: any) => {
        fileTree.push(file.path)
      })
    })

    // Files that should include full content (template-specific)
    const fullContentFiles = projectType === 'nextjs' ? [
      'package.json',
      'src/app/page.tsx',
      'src/app/layout.tsx',
      'next.config.js',
      'next.config.mjs',
      'tailwind.config.js',
      'tsconfig.json'
    ] : [
      'package.json',
      'src/App.tsx',
      'src/main.tsx',
      'App.tsx',
      'main.tsx',
      'index.tsx',
      'vite.config.ts',
      'tailwind.config.js',
      'tsconfig.json'
    ]

    // Build the context
    let context = `# Current Time
${currentTime}

# Project Type
${projectType === 'nextjs' ? '**Next.js** - Full-stack React framework with App Router' : projectType === 'vite-react' ? '**Vite + React** - Fast build tool with React' : 'Unknown'}

${projectType === 'nextjs' ? `## Next.js Project Structure
- **src/app/** - App Router pages and layouts
- **src/components/** - React components  
- **src/lib/** - Utilities and helpers
- **public/** - Static assets
- **API Routes:** Create in src/app/api/[name]/route.ts` : 
`## Vite Project Structure
- **src/** - Source code directory
- **src/components/** - React components
- **src/lib/** - Utilities and helpers
- **public/** - Static assets
- **api/** - Serverless functions (Vercel)`}

# Current Project Structure
${fileTree.join('\n')}
# Important Files Content
---`

    // Add full content for important files
    for (const filePath of fullContentFiles) {
      const file = files.find((f: any) => f.path === filePath || f.path.endsWith(`/${filePath}`))
      if (file && file.content) {
        context += `

## ${file.path}
\`\`\`${getFileExtension(file.path)}
${file.content}
\`\`\``
      }
    }

    console.log(`[CONTEXT] Built file tree with ${fileTree.length} files, ${fullContentFiles.length} with full content`)
    return context

  } catch (error) {
    console.error('Error building project context:', error)
    return `# Current Time
${new Date().toLocaleString()}

# Project Context Error
Unable to load project structure. Use list_files tool to explore the project.`
  }
}

// SMART CONTEXT PROVIDER: Use Mistral Pixtral to select relevant files and produce a src patch
async function buildSmartContextForA0(projectId: string, userMessage: string, storageManager: any) {
  try {
    // Load files and limit candidate set
    const allFiles = await storageManager.getFiles(projectId)
    // Prioritize src/ files and recently modified files
    const candidateFiles = allFiles
      .filter((f: any) => (f.path.startsWith('src/') || f.path.endsWith('.ts') || f.path.endsWith('.tsx') || f.path.endsWith('.js') || f.path.endsWith('.jsx')) && !f.path.startsWith('src/components/ui/') && !f.path.startsWith('components/ui/') && !f.path.startsWith('hooks/'))
      .slice(-200) // cap candidates

    // Read small previews for the model to analyze
    const filePreviews: string[] = []
    for (const f of candidateFiles) {
      try {
        const fileObj = await storageManager.getFile(projectId, f.path)
        if (fileObj && fileObj.content) {
          // Limit per-file content to avoid huge prompts
          const snippet = fileObj.content.substring(0, 2000)
          filePreviews.push(`File: ${f.path}\n${snippet}`)
        }
      } catch (e) {
        // ignore read errors
      }
    }

    const mistralPixtral = getMistralPixtralModel()

    const selectionPrompt = `You are a code-context selector. Given the user's request and a list of project file previews, choose up to 10 files most relevant to the user's request. Return JSON: { "selected": [{"path":"...","reason":"short reason"}], "srcPatch": "text description of src structure changes (if any)" }\n\nUser Request: ${userMessage}\n\nFILES:\n${filePreviews.join('\n\n---\n\n')}`

    const selection = await generateText({
      model: mistralPixtral,
      messages: [
        { role: 'system', content: 'You are an assistant that selects most relevant project files for a code-edit request.' },
        { role: 'user', content: selectionPrompt }
      ],
      temperature: 0.0
    })

    // Parse selection JSON from response
    let parsed: any = { selected: [], srcPatch: '' }
    try {
      let text = selection.text || ''
      if (text.includes('```json')) {
        text = text.replace(/```json\s*/, '').replace(/\s*```$/, '')
      } else if (text.includes('```')) {
        text = text.replace(/```\s*/, '').replace(/\s*```$/, '')
      }
      text = text.trim()
      const start = text.indexOf('{')
      const end = text.lastIndexOf('}')
      if (start !== -1 && end !== -1) {
        const jsonText = text.substring(start, end + 1)
        parsed = JSON.parse(jsonText)
      }
    } catch (e) {
      console.warn('[SMART-CONTEXT] Failed to parse selection JSON, falling back to simple heuristic')
    }

    // Build final selectedFiles with content
    const selectedFiles: Array<any> = []
    const maxSelected = 10
    const paths = (parsed.selected || []).slice(0, maxSelected).map((s: any) => s.path)
    for (const p of paths) {
      try {
        const fileObj = await storageManager.getFile(projectId, p)
        if (fileObj) selectedFiles.push({ path: p, content: fileObj.content || '' })
      } catch (e) {
        // ignore
      }
    }

    return {
      selectedFiles,
      srcPatch: parsed.srcPatch || ''
    }
  } catch (error) {
    console.error('[SMART-CONTEXT] Error building smart context:', error)
    return { selectedFiles: [], srcPatch: '' }
  }
}

// Helper function to get file extension for syntax highlighting
function getFileExtension(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'tsx':
    case 'jsx':
      return 'typescript'
    case 'ts':
      return 'typescript'
    case 'js':
      return 'javascript'
    case 'json':
      return 'json'
    case 'css':
      return 'css'
    case 'scss':
    case 'sass':
      return 'scss'
    case 'html':
      return 'html'
    case 'md':
      return 'markdown'
    case 'yml':
    case 'yaml':
      return 'yaml'
    case 'sql':
      return 'sql'
    case 'cjs':
      return 'javascript'
    case 'env':
      return 'text'
    default:
      return ext || 'text'
  }
}

// AI-Enhanced Memory Processing Functions
async function processMemoryWithAI(
  conversationMemory: any,
  userMessage: string,
  projectContext: string,
  toolCalls?: any[]
) {
  try {
    const mistralPixtral = getMistralPixtralModel()
    
    const enhancedMemory = await generateText({
      model: mistralPixtral,
      messages: [
        { role: 'system', content: 'You are an AI assistant analyzing development conversations.' },
        { role: 'user', content: `Analyze this development conversation and enhance the memory with intelligent insights:

User Message: "${userMessage}"
Project Context: ${projectContext}
Conversation History: ${JSON.stringify(conversationMemory?.messages?.slice(-20) || [])}
Tool Calls: ${JSON.stringify(toolCalls || [])}

Provide a JSON response with enhanced memory analysis:
{
  "semanticSummary": "Intelligent summary of development progress and key decisions",
  "keyInsights": ["insight1", "insight2", "insight3"],
  "technicalPatterns": ["pattern1", "pattern2"],
  "architecturalDecisions": ["decision1", "decision2"],
  "nextLogicalSteps": ["step1", "step2"],
  "potentialImprovements": ["improvement1", "improvement2"],
  "relevanceScore": 0.0-1.0,
  "contextForFuture": "What future developers should know about this work"
}

Focus on extracting meaningful patterns, decisions, and insights that will be valuable for future development.` }
      ],
      temperature: 0.3
    })

    try {
      // Check if the response is actually JSON
      console.log('[DEBUG] Memory enhancement response type check:', {
        hasText: !!enhancedMemory.text,
        textLength: enhancedMemory.text?.length || 0,
        startsWithBrace: enhancedMemory.text?.trim().startsWith('{') || false,
        textPreview: enhancedMemory.text?.substring(0, 100) || 'no text'
      })
      
      if (enhancedMemory.text && enhancedMemory.text.trim().startsWith('{')) {
        // Extract JSON from markdown response if present
        let jsonText = enhancedMemory.text
        if (jsonText.includes('```json')) {
          jsonText = jsonText.replace(/```json\s*/, '').replace(/\s*```$/, '')
        } else if (jsonText.includes('```')) {
          jsonText = jsonText.replace(/```\s*/, '').replace(/\s*```$/, '')
        }
        jsonText = jsonText.trim()
        
        // Remove any text after the JSON object
        const jsonEndIndex = jsonText.lastIndexOf('}')
        if (jsonEndIndex !== -1) {
          jsonText = jsonText.substring(0, jsonEndIndex + 1)
        }
        
        const parsed = JSON.parse(jsonText)
      return {
        semanticSummary: parsed.semanticSummary || 'Development progress analyzed',
        keyInsights: parsed.keyInsights || [],
        technicalPatterns: parsed.technicalPatterns || [],
        architecturalDecisions: parsed.architecturalDecisions || [],
        nextLogicalSteps: parsed.nextLogicalSteps || [],
        potentialImprovements: parsed.potentialImprovements || [],
        relevanceScore: parsed.relevanceScore || 0.8,
        contextForFuture: parsed.contextForFuture || 'Standard development patterns used',
        }
      } else {
        // Handle non-JSON responses (plain text)
        console.log('[DEBUG] AI returned plain text instead of JSON for memory enhancement')
        return {
          semanticSummary: enhancedMemory.text || 'Development progress tracked',
          keyInsights: ['Basic development patterns established'],
          technicalPatterns: ['Standard React/TypeScript patterns'],
          architecturalDecisions: ['Component-based architecture'],
          nextLogicalSteps: ['Continue with current patterns'],
          potentialImprovements: ['Consider adding tests'],
          relevanceScore: 0.7,
          contextForFuture: 'Standard development approach used'
        }
      }
    } catch (parseError) {
      console.warn('Failed to parse AI memory enhancement, using fallback:', parseError)
      return {
        semanticSummary: 'Development progress tracked',
        keyInsights: ['Basic development patterns established'],
        technicalPatterns: ['Standard React/TypeScript patterns'],
        architecturalDecisions: ['Component-based architecture'],
        nextLogicalSteps: ['Continue with current patterns'],
        potentialImprovements: ['Consider adding tests'],
        relevanceScore: 0.7,
        contextForFuture: 'Standard development approach used'
      }
    }
  } catch (error) {
    console.error('AI memory enhancement failed:', error)
    // Return fallback enhancement
    return {
      semanticSummary: 'Memory processing completed',
      keyInsights: ['Development work tracked'],
      technicalPatterns: ['React/TypeScript patterns'],
      architecturalDecisions: ['Component architecture'],
      nextLogicalSteps: ['Continue development'],
      potentialImprovements: ['Add documentation'],
      relevanceScore: 0.6,
      contextForFuture: 'Development work in progress'
    }
  }
}

// ULTRA-COMPACT: Memory retrieval (80% token reduction)
async function findRelevantMemories(
  userQuery: string,
  projectContext: string,
  conversationMemory: any
) {
  try {
    // OPTIMIZATION: Compress conversation memory to essential info only
    const compressedMemory = conversationMemory?.messages?.slice(-10).map((m: any) =>
      `${m.role[0]}:${m.content.substring(0, 100)}`
    ).join('|') || ''

    // OPTIMIZATION: Compact prompt format
    const compactQuery = `${userQuery.substring(0, 200)}|${compressedMemory}`

    const mistralPixtral = getMistralPixtralModel()
    const relevantMemories = await generateText({
      model: mistralPixtral,
      messages: [
        { role: 'system', content: 'JSON: {"context":"", "files":[], "score":0.5}' },
        { role: 'user', content: compactQuery }
      ],
      temperature: 0.3,
    })

    try {
      // Check if the response is actually JSON
      console.log('[DEBUG] Memory retrieval response type check:', {
        hasText: !!relevantMemories.text,
        textLength: relevantMemories.text?.length || 0,
        startsWithBrace: relevantMemories.text?.trim().startsWith('{') || false,
        textPreview: relevantMemories.text?.substring(0, 100) || 'no text'
      })
      
      if (relevantMemories.text && relevantMemories.text.trim().startsWith('{')) {
        const parsed = JSON.parse(relevantMemories.text)
      return {
        relevantContext: parsed.relevantContext || 'No specific relevant context found',
        keyRelevantFiles: parsed.keyRelevantFiles || [],
        relevantDecisions: parsed.relevantDecisions || [],
        applicablePatterns: parsed.applicablePatterns || [],
        relevanceScore: parsed.relevanceScore || 0.5,
        whyRelevant: parsed.whyRelevant || 'General development context'
        }
      } else {
        // Handle non-JSON responses (plain text)
        console.log('[DEBUG] AI returned plain text instead of JSON for memory retrieval')
        return {
          relevantContext: relevantMemories.text || 'General development context available',
          keyRelevantFiles: [],
          relevantDecisions: ['Standard development patterns'],
          applicablePatterns: ['React/TypeScript best practices'],
          relevanceScore: 0.5,
          whyRelevant: 'Provides general development guidance'
        }
      }
    } catch (parseError) {
      console.warn('Failed to parse AI memory retrieval, using fallback:', parseError)
      return {
        relevantContext: 'General development context available',
        keyRelevantFiles: [],
        relevantDecisions: ['Standard development patterns'],
        applicablePatterns: ['React/TypeScript best practices'],
        relevanceScore: 0.5,
        whyRelevant: 'Provides general development guidance'
      }
    }
  } catch (error) {
    console.error('AI memory retrieval failed:', error)
    return {
      relevantContext: 'Basic development context',
      keyRelevantFiles: [],
      relevantDecisions: ['Standard patterns'],
      applicablePatterns: ['Best practices'],
      relevanceScore: 0.4,
      whyRelevant: 'General development knowledge'
    }
  }
}

// AI Learning from Development Patterns
async function learnFromPatterns(
  projectId: string,
  userId: string,
  conversationMemory: any,
  projectFiles: any[]
) {
  try {
    const mistralPixtral = getMistralPixtralModel()
    
    // OPTIMIZATION 1: Filter files - only src/ files, exclude ui components
    const relevantFiles = projectFiles.filter(file => 
      file.path.startsWith('src/') && 
      !file.path.startsWith('src/components/ui/') &&
      !file.isDirectory
    )
    
    // OPTIMIZATION 2: Truncate file content to max 50 tokens (~200 chars) per file
    const truncatedFiles = relevantFiles.slice(0, 10).map(file => ({
      path: file.path,
      content: (file.content || '').substring(0, 200) + (file.content?.length > 200 ? '...' : ''),
      type: file.fileType || 'text'
    }))
    
    // OPTIMIZATION 3: Only last 5 messages with truncation
    const recentMessages = (conversationMemory?.messages || [])
      .slice(-5)
      .map((msg: any) => ({
        role: msg.role,
        content: (msg.content || '').substring(0, 100) + (msg.content?.length > 100 ? '...' : '')
      }))
    // ULTRA-COMPACT: 100-token optimization with type safety
    const messagesSummary = recentMessages.map((m: { role: string, content: string }) => 
      `${m.role[0]}:${m.content.substring(0, 50)}`
    ).join('|')
    const filesSummary = truncatedFiles.map((f: { path: string, type: string }) => 
      `${f.path.split('/').pop()}:${f.type}`
    ).join(',')
    const promptContent = `${messagesSummary}|${filesSummary}`

    const estimatedTokens = Math.ceil(promptContent.length / 4)
    console.log(`[ULTRA-COMPACT] Token estimate: ${estimatedTokens}`)

    const learningInsights = await generateText({
      model: mistralPixtral,
      messages: [
        { role: 'system', content: 'JSON output only: {"patterns":[], "tech":[], "score":0.0}' },
        { role: 'user', content: promptContent }
      ],
      temperature: 0.1,
    })

    try {
      // Check if the response is actually JSON
      console.log('[DEBUG] Learning insights response type check:', {
        hasText: !!learningInsights.text,
        textLength: learningInsights.text?.length || 0,
        startsWithBrace: learningInsights.text?.trim().startsWith('{') || false,
        textPreview: learningInsights.text?.substring(0, 100) || 'no text'
      })
      
      if (learningInsights.text && learningInsights.text.trim().startsWith('{')) {
        // Extract JSON from markdown response if present
        let jsonText = learningInsights.text
        if (jsonText.includes('```json')) {
          jsonText = jsonText.replace(/```json\s*/, '').replace(/\s*```$/, '')
        } else if (jsonText.includes('```')) {
          jsonText = jsonText.replace(/```\s*/, '').replace(/\s*```$/, '')
        }
        jsonText = jsonText.trim()
        
        // Remove any text after the JSON object
        const jsonEndIndex = jsonText.lastIndexOf('}')
        if (jsonEndIndex !== -1) {
          jsonText = jsonText.substring(0, jsonEndIndex + 1)
        }
        
        const parsed = JSON.parse(jsonText)
      return {
        codingStyle: parsed.style || parsed.codingStyle || 'Standard React/TypeScript patterns',
        componentPatterns: parsed.patterns || parsed.componentPatterns || ['Functional components'],
        stylingPreferences: parsed.styling || parsed.stylingPreferences || ['Tailwind CSS'],
        technicalDecisions: parsed.tech || parsed.technicalDecisions || ['Component-based architecture'],
        commonApproaches: parsed.approaches || parsed.commonApproaches || ['Modular development'],
        optimizationAreas: parsed.areas || parsed.optimizationAreas || ['Code organization'],
        learningScore: parsed.score || parsed.learningScore || 0.7,
        recommendations: parsed.recs || parsed.recommendations || ['Continue current patterns']
        }
      } else {
        // Handle non-JSON responses (plain text)
        console.log('[DEBUG] AI returned plain text instead of JSON for learning insights')
        return {
          codingStyle: learningInsights.text || 'Standard React/TypeScript patterns',
          componentPatterns: ['Functional components'],
          stylingPreferences: ['Tailwind CSS'],
          technicalDecisions: ['Component-based architecture'],
          commonApproaches: ['Modular development'],
          optimizationAreas: ['Code organization'],
          learningScore: 0.6,
          recommendations: ['Continue current patterns']
        }
      }
    } catch (parseError) {
      console.warn('Failed to parse AI learning insights, using fallback:', parseError)
      return {
        codingStyle: 'Standard React/TypeScript patterns',
        componentPatterns: ['Functional components'],
        stylingPreferences: ['Tailwind CSS'],
        technicalDecisions: ['Component-based architecture'],
        commonApproaches: ['Modular development'],
        optimizationAreas: ['Code organization'],
        learningScore: 0.6,
        recommendations: ['Continue current patterns']
      }
    }
  } catch (error) {
    console.error('AI learning analysis failed:', error)
    return {
      codingStyle: 'Standard development patterns',
      componentPatterns: ['Basic components'],
      stylingPreferences: ['CSS frameworks'],
      technicalDecisions: ['Standard architecture'],
      commonApproaches: ['Basic development'],
      optimizationAreas: ['General improvement'],
      learningScore: 0.5,
      recommendations: ['Follow best practices']
    }
  }
}

// Helper function to detect if user is reporting code issues
function isReportingCodeIssues(userMessage: string, intentData?: any): boolean {
  const lowerMessage = userMessage.toLowerCase()

  // Keywords that indicate code issues or problems
  const codeIssueKeywords = [
    'error', 'bug', 'issue', 'problem', 'broken', 'not working', 'fails', 'failing',
    'crash', 'crashes', 'exception', 'debug', 'fix', 'broken', 'malfunction',
    'dependency issue', 'import error', 'compilation error', 'runtime error',
    'type error', 'syntax error', 'linting error', 'build error', 'test failure',
    'doesn\'t work', 'won\'t work', 'can\'t', 'unable to', 'stuck', 'hangs',
    'freezes', 'stops working', 'not responding', 'issues with', 'problems with',
    'trouble with', 'having issues', 'having problems', 'need help with'
  ]

  // Check if any code issue keywords are present
  const hasCodeIssueKeywords = codeIssueKeywords.some(keyword =>
    lowerMessage.includes(keyword)
  )

  // Check intent data for debugging or fixing patterns
  const hasDebugIntent = intentData?.intent?.toLowerCase().includes('debug') ||
                        intentData?.intent?.toLowerCase().includes('fix') ||
                        intentData?.intent?.toLowerCase().includes('error')

  return hasCodeIssueKeywords || hasDebugIntent
}

// Helper function to create file operation tools based on AI mode
function createFileOperationTools(projectId: string, aiMode: 'ask' | 'agent' = 'agent', conversationMemory: any[] = [], userId?: string, intentData?: any, userMessage?: string) {
  const tools: Record<string, any> = {}

  // Check if user is reporting code issues - only include advanced tools then
  const userReportingIssues = userMessage ? isReportingCodeIssues(userMessage, intentData) : false

  // Check if web tools are explicitly needed based on intent detection
  const needsWebTools = intentData?.required_tools?.includes('web_search') || intentData?.required_tools?.includes('web_extract')

  // ASK MODE: Include read-only tools for codebase exploration and analysis
  if (aiMode === 'ask') {
    // Always include read and analysis tools for ask mode
    tools.read_file = tool({
      description: 'Read and analyze file contents for codebase discussion and questions',
      inputSchema: z.object({
        path: z.string().describe('File path to read for analysis')
      }),
      execute: async ({ path }, { abortSignal, toolCallId }) => {
        if (abortSignal?.aborted) {
          throw new Error('Operation cancelled')
        }

        try {
          console.log('[DEBUG] Executing read_file tool:', { path, projectId })
          const { storageManager } = await import('@/lib/storage-manager')
          await storageManager.init()

          const file = await storageManager.getFile(projectId, path)
          console.log('[DEBUG] read_file result:', { path, fileFound: !!file, fileSize: file?.size })
          
          if (!file) {
            return {
              success: false,
              error: `File not found: ${path}`,
              toolCallId
            }
          }

          return {
            success: true,
            message: `📖 Analyzed file: ${path}`,
            path,
            content: file.content,
            size: file.size,
            type: file.type,
            toolCallId
          }
        } catch (error) {
          console.error('[DEBUG] read_file error:', error)
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          return {
            success: false,
            error: `Failed to read file: ${errorMessage}`,
            toolCallId
          }
        }
      }
    })

  // List files tool - available in both modes  
  tools.list_files = tool({
    description: 'List files and directories in a specific folder path',
    inputSchema: z.object({
      path: z.string().describe('Directory path to list (use "/" for root)')
    }),
    execute: async ({ path }, { abortSignal, toolCallId }) => {
      if (abortSignal?.aborted) {
        throw new Error('Operation cancelled')
      }
      
      try {
        const { storageManager } = await import('@/lib/storage-manager')
        await storageManager.init()
        
        // Validate path
        if (!path || typeof path !== 'string') {
          return { 
            success: false, 
            error: `Invalid directory path provided`,
            path,
            toolCallId
          }
        }
        
        // Get all files from the project
        const allFiles = await storageManager.getFiles(projectId)
        
        // Filter files based on the requested path
        let filteredFiles;
        if (path === '/' || path === '') {
          // Root directory - show all files at root level
          filteredFiles = allFiles.filter(f => {
            const pathParts = f.path.split('/').filter(p => p.length > 0)
            return pathParts.length === 1 // Only top-level files
          })
        } else {
          // Specific directory - show files in that directory
          const normalizedPath = path.startsWith('/') ? path.slice(1) : path
          const searchPath = normalizedPath.endsWith('/') ? normalizedPath : normalizedPath + '/'
          
          filteredFiles = allFiles.filter(f => {
            return f.path.startsWith(searchPath) && 
                   f.path.slice(searchPath.length).indexOf('/') === -1 // Only direct children
          })
        }

        return { 
          success: true, 
          message: `✅ Listed ${filteredFiles.length} items in directory: ${path}`,
          path,
          files: filteredFiles.map(f => ({
            name: f.name,
            path: f.path,
            type: f.type,
            size: f.size,
            isDirectory: f.isDirectory,
            createdAt: f.createdAt
          })),
          count: filteredFiles.length,
          action: 'list',
          toolCallId
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[ERROR] list_files failed for ${path}:`, error)
        
        return { 
          success: false, 
          error: `Failed to list directory ${path}: ${errorMessage}`,
          path,
          toolCallId
        }
      }
    }
  })

    // Include analysis tools for ask mode
    tools.analyze_dependencies = tool({
      description: 'Analyze project dependencies and provide insights for codebase understanding',
      inputSchema: z.object({
        filePath: z.string().optional().describe('Specific file to analyze (optional)')
      }),
      execute: async ({ filePath }, { abortSignal, toolCallId }) => {
        if (abortSignal?.aborted) {
          throw new Error('Operation cancelled')
        }

        try {
          const { storageManager } = await import('@/lib/storage-manager')
          await storageManager.init()

          const files = await storageManager.getFiles(projectId)

          // Analyze package.json if available
          const packageJson = files.find(f => f.path === 'package.json')

          let analysis = {
            totalFiles: files.length,
            fileTypes: {} as Record<string, number>,
            dependencies: {} as Record<string, string>,
            scripts: {} as Record<string, string>,
            analysis: [] as string[]
          }

          if (packageJson) {
            try {
              const pkg = JSON.parse(packageJson.content)
              analysis.dependencies = pkg.dependencies || {}
              analysis.scripts = pkg.scripts || {}
              analysis.analysis.push(`📦 Found ${Object.keys(analysis.dependencies).length} dependencies`)
              analysis.analysis.push(`🎯 Found ${Object.keys(analysis.scripts).length} npm scripts`)
            } catch (e) {
              analysis.analysis.push('⚠️ Could not parse package.json')
            }
          }

          // Count file types
          files.forEach(f => {
            const ext = f.path.split('.').pop() || 'no-ext'
            analysis.fileTypes[ext] = (analysis.fileTypes[ext] || 0) + 1
          })

          return {
            success: true,
            message: '🔍 Completed dependency and project analysis',
            analysis,
            toolCallId
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          return {
            success: false,
            error: `Analysis failed: ${errorMessage}`,
            toolCallId
          }
        }
      }
    })

  }

  // Debug logging to verify web tools are conditionally included
  console.log('[DEBUG] Web Tools Conditional Logic:', {
    needsWebTools,
    requiredTools: intentData?.required_tools || [],
    intent: intentData?.intent || 'unknown',
    confidence: intentData?.confidence || 0
  })
  
  

  // Enhanced conversation memory tool with AI-powered context retrieval
  // Only include when user is reporting code issues
  if (userReportingIssues) {
    tools.recall_context = tool({
    description: 'Recall previous conversation context and key points with AI-enhanced analysis',
    inputSchema: z.object({
      limit: z.number().optional().describe('Number of recent messages to recall (default: 10)'),
      includeUserMessages: z.boolean().optional().describe('Include user messages in the recall (default: true)'),
      includeAssistantMessages: z.boolean().optional().describe('Include assistant messages in the recall (default: true)'),
      useAIEnhancement: z.boolean().optional().describe('Use AI to enhance context retrieval (default: true)')
    }),
    execute: async ({ limit = 10, includeUserMessages = true, includeAssistantMessages = true, useAIEnhancement = true }, { abortSignal, toolCallId }) => {
      if (abortSignal?.aborted) {
        throw new Error('Operation cancelled')
      }
      
      try {
        // Import storage manager for conversation memory
        const { storageManager } = await import('@/lib/storage-manager')
        await storageManager.init()
        
        // Get conversation memory from storage using the passed user ID
        const actualUserId = userId || global.currentUserId || 'current-user'
        const conversationMemory = await storageManager.getConversationMemory(projectId, actualUserId)
        const conversationHistory = conversationMemory?.messages || []
        
        let filteredMessages = conversationHistory
        
        // Filter by message type if specified
        if (!includeUserMessages || !includeAssistantMessages) {
          filteredMessages = conversationHistory.filter((msg: any) => {
            if (!includeUserMessages && msg.role === 'user') return false
            if (!includeAssistantMessages && msg.role === 'assistant') return false
            return true
          })
        }
        
        // Filter out messages that are just announcements without actual tool executions
        const messagesWithActualActions = filteredMessages.filter((msg: any) => {
          if (msg.role !== 'assistant') return true

          // Check if message contains actual JSON tool calls
          const hasJsonToolCall = msg.content.includes('```json') && (
            msg.content.includes('"tool": "write_file"') ||
            msg.content.includes('"tool": "delete_file"') ||
            msg.content.includes('"tool": "remove_package"')
          )

          // If it has JSON tool calls, definitely include it
          if (hasJsonToolCall) return true

          // Check for problematic announcement patterns that are NOT followed by tool calls
          const problematicAnnouncementPatterns = [
            /^Now, create the .* component/i,
            /^Now, update the .* component/i,
            /^🔄 Creating the .* component/i,
            /^🔄 Updating the .* component/i,
            /^First, create the .* component/i,
            /^First, update the .* component/i,
            /^Let's create the .* component/i,
            /^Let's update the .* component/i,
            /^Now, create the .* page/i,
            /^Now, update the .* page/i,
            /^🔄 Creating the .* page/i,
            /^🔄 Updating the .* page/i
          ]

          // For problematic announcements, add a system warning but keep the message
          const isProblematicAnnouncement = problematicAnnouncementPatterns.some(pattern => pattern.test(msg.content.trim()))

          if (isProblematicAnnouncement && !hasJsonToolCall) {
            // Add system warning to the message content
            msg.content = `⚠️ **SYSTEM WARNING: Unfulfilled Announcement** ⚠️\n\nThis message announced an action that was never executed with JSON tools. This indicates a previous AI error that should be corrected.\n\n${msg.content}\n\n---\n**ACTION REQUIRED:** The announced action should be completed using proper JSON tool calls.`
          }

          // Include all messages (both good and flagged ones)
          return true
        })

        // Limit the number of messages
        const limitedMessages = messagesWithActualActions.slice(-limit)
        
        // Basic analysis for key points
        const keyPoints: string[] = []
        const fileOperations: string[] = []
        const decisions: string[] = []
        
        limitedMessages.forEach((msg: any) => {
          if (msg.role === 'assistant') {
            // Extract key information from assistant messages
            if (msg.content.includes('created') || msg.content.includes('modified')) {
              fileOperations.push(msg.content.substring(0, 100) + '...')
            }
            if (msg.content.includes('decided') || msg.content.includes('chose')) {
              decisions.push(msg.content.substring(0, 100) + '...')
            }
          }
        })
        
        // AI-enhanced context retrieval if enabled
        let aiEnhancedContext = null
        if (useAIEnhancement && conversationMemory) {
          try {
            const projectContext = await buildOptimizedProjectContext(projectId, storageManager, conversationMemory)
            aiEnhancedContext = await findRelevantMemories(
              'What is most important to remember from our development work?',
              projectContext,
              conversationMemory
            )
          } catch (aiError) {
            console.warn('AI enhancement failed, using basic context:', aiError)
          }
        }
        
        // Combine basic and AI-enhanced insights
        const enhancedKeyPoints = aiEnhancedContext ? [
          ...keyPoints,
          ...aiEnhancedContext.relevantDecisions,
          ...aiEnhancedContext.applicablePatterns
        ] : keyPoints
        
        const enhancedSummary = aiEnhancedContext ? 
          `${aiEnhancedContext.relevantContext}\n\nConversation contains ${limitedMessages.length} messages with ${fileOperations.length} file operations and ${decisions.length} key decisions` :
          `Conversation contains ${limitedMessages.length} messages with ${fileOperations.length} file operations and ${decisions.length} key decisions`
        
        return {
          success: true,
          message: `Retrieved ${limitedMessages.length} messages from conversation memory${aiEnhancedContext ? ' with AI enhancement' : ''}`,
          messages: limitedMessages.map((msg: any) => ({
            role: msg.role,
            content: msg.content.substring(0, 200) + (msg.content.length > 200 ? '...' : ''),
            timestamp: msg.timestamp || new Date().toISOString()
          })),
          summary: enhancedSummary,
          keyPoints: enhancedKeyPoints,
          count: limitedMessages.length,
          // AI-enhanced insights
          aiInsights: aiEnhancedContext ? {
            relevantContext: aiEnhancedContext.relevantContext,
            technicalPatterns: aiEnhancedContext.applicablePatterns,
            relevanceScore: aiEnhancedContext.relevanceScore,
            whyRelevant: aiEnhancedContext.whyRelevant
          } : null,
          toolCallId
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('[ERROR] recall_context failed:', error)
        
        // Provide fallback response instead of failing
        return { 
          success: true, 
          message: `Context recall completed with some issues: ${errorMessage}`,
          messages: [],
          summary: 'No context available due to error',
          keyPoints: [],
          count: 0,
          toolCallId
        }
      }
    }
  })

  } // End conditional for recall_context

  // Add knowledge base tool
  // Only include when user is reporting code issues
  if (userReportingIssues) {
    tools.search_knowledge = tool({
      description: 'Advanced knowledge search with semantic matching, content categorization, and relevance ranking',
      inputSchema: z.object({
        query: z.string().optional().describe('Search query or keywords for semantic search'),
        id: z.string().optional().describe('Specific ID to retrieve (alternative to query)'),
        category: z.string().optional().describe('Filter by category'),
        tags: z.array(z.string()).optional().describe('Filter by tags'),
        semantic: z.boolean().optional().describe('Use semantic search (default: true)'),
        maxResults: z.number().optional().describe('Maximum results to return (default: 5)'),
        sortBy: z.enum(['relevance', 'date', 'title']).optional().describe('Sort results by (default: relevance)')
      }),
      execute: async ({ query, id, category, tags, semantic = true, maxResults = 5, sortBy = 'relevance' }, { abortSignal, toolCallId }) => {
        if (abortSignal?.aborted) {
          throw new Error('Operation cancelled')
        }

        try {
          // Import knowledge base service
          const { KnowledgeBase } = await import('@/lib/knowledge-base')

          // If specific ID provided, use direct lookup
          if (id) {
            const item = KnowledgeBase.getById(id)

            if (!item) {
              const allItems = KnowledgeBase.getAll()
              const availableIds = allItems.map((item: any) => item.id).slice(0, 10).join(', ')

              return {
                success: false,
                error: `Knowledge item with ID '${id}' not found. Available IDs: ${availableIds}...`,
                availableItems: allItems.slice(0, 5).map((item: any) => ({
                  id: item.id,
                  title: item.title,
                  category: item.category
                })),
                toolCallId
              }
            }

            return {
              success: true,
              message: `Retrieved knowledge item: ${item.title}`,
              item: {
                id: item.id,
                title: item.title,
                content: item.content,
                category: item.category,
                tags: item.tags,
                createdAt: item.createdAt,
                updatedAt: item.createdAt // Use createdAt as fallback since updatedAt doesn't exist
              },
              toolCallId
            }
          }

          // Semantic search functionality
          if (!query && !category && !tags) {
            return {
              success: false,
              error: 'Please provide either a query, category, or tags to search',
              toolCallId
            }
          }

          const allItems = KnowledgeBase.getAll()

          // Filter by category and tags first
          let filteredItems = allItems

          if (category) {
            filteredItems = filteredItems.filter((item: any) =>
              item.category?.toLowerCase().includes(category.toLowerCase())
            )
          }

          if (tags && tags.length > 0) {
            filteredItems = filteredItems.filter((item: any) =>
              tags.some((tag: string) =>
                item.tags?.some((itemTag: string) =>
                  itemTag.toLowerCase().includes(tag.toLowerCase())
                )
              )
            )
          }

          // Semantic search scoring
          let scoredItems = filteredItems.map((item: any) => {
            let score = 0
            const title = item.title?.toLowerCase() || ''
            const content = item.content?.toLowerCase() || ''
            const itemTags = item.tags?.join(' ').toLowerCase() || ''
            const itemCategory = item.category?.toLowerCase() || ''

            if (query) {
              const searchTerms = query.toLowerCase().split(' ')

              // Title matches (highest weight)
              searchTerms.forEach(term => {
                if (title.includes(term)) score += 10
                if (title.startsWith(term)) score += 5
              })

              // Content matches
              searchTerms.forEach(term => {
                const contentCount = (content.match(new RegExp(term, 'g')) || []).length
                score += contentCount * 2
              })

              // Tag matches
              searchTerms.forEach(term => {
                if (itemTags.includes(term)) score += 7
              })

              // Category matches
              searchTerms.forEach(term => {
                if (itemCategory.includes(term)) score += 6
              })
            } else {
              score = 5 // Base score for filtered items
            }

            return { ...item, relevanceScore: score }
          })

          // Sort by relevance or other criteria
          switch (sortBy) {
            case 'date':
              scoredItems.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
              break
            case 'title':
              scoredItems.sort((a, b) => a.title.localeCompare(b.title))
              break
            default: // relevance
              scoredItems.sort((a, b) => b.relevanceScore - a.relevanceScore)
          }

          // Limit results
          const results = scoredItems.slice(0, maxResults)

          // Group by categories for better organization
          const categories = [...new Set(results.map(item => item.category).filter(Boolean))]
          const categoryGroups = categories.map(cat => ({
            category: cat,
            items: results.filter(item => item.category === cat).map(item => ({
              id: item.id,
              title: item.title,
              relevanceScore: item.relevanceScore,
              tags: item.tags,
              preview: item.content?.substring(0, 100) + '...'
            }))
          }))

          return {
            success: true,
            message: `Found ${results.length} knowledge items${query ? ` for query "${query}"` : ''}`,
            results: results.map(item => ({
              id: item.id,
              title: item.title,
              category: item.category,
              tags: item.tags,
              relevanceScore: item.relevanceScore,
              contentLength: item.content?.length || 0,
              createdAt: item.createdAt,
              updatedAt: item.updatedAt
            })),
            categoryGroups,
            totalAvailable: allItems.length,
            searchCriteria: {
              query,
              category,
              tags,
              semantic,
              maxResults,
              sortBy
            },
            toolCallId
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          console.error('[ERROR] search_knowledge failed:', error)

          return {
            success: false,
            error: `Knowledge search failed: ${errorMessage}`,
            toolCallId
          }
        }
      }
    })

  } // End conditional for search_knowledge

  // Get knowledge item tool
  // Only include when user is reporting code issues
  if (userReportingIssues) {
    tools.get_knowledge_item = tool({
    description: 'Get a specific knowledge item by ID',
    inputSchema: z.object({
      id: z.string().describe('ID of the knowledge item to retrieve')
    }),
    execute: async ({ id }, { abortSignal, toolCallId }) => {
      if (abortSignal?.aborted) {
        throw new Error('Operation cancelled')
      }
      
      try {
        // Import knowledge base service
        const { KnowledgeBase } = await import('@/lib/knowledge-base')
        
        const item = KnowledgeBase.getById(id)
        
        if (!item) {
          // If item not found, provide a helpful response with available IDs
          const allItems = KnowledgeBase.getAll()
          const availableIds = allItems.map((item: any) => item.id).join(', ')
          
          return {
            success: false,
            error: `Knowledge item with ID '${id}' not found. Available IDs: ${availableIds}`,
            toolCallId
          }
        }
        
        return {
          success: true,
          message: `Retrieved knowledge item: ${item.title}`,
          content: item.content,
          toolCallId
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('[ERROR] get_knowledge_item failed:', error)
        
        // Provide fallback response instead of failing
        return { 
          success: false, 
          error: `Failed to retrieve knowledge item: ${errorMessage}. Please try again or use search_knowledge instead.`,
          toolCallId
        }
      }
    }
  })

  } // End conditional for get_knowledge_item

  
  // Read and list tools - available in both modes
  tools.read_file = tool({
    description: 'Read the contents of a file',
    inputSchema: z.object({
      path: z.string().describe('File path to read')
    }),
    execute: async ({ path }, { abortSignal, toolCallId }) => {
      if (abortSignal?.aborted) {
        throw new Error('Operation cancelled')
      }
      
      try {
        const { storageManager } = await import('@/lib/storage-manager')
        await storageManager.init()
        
        // Validate path
        if (!path || typeof path !== 'string') {
          return { 
            success: false, 
            error: `Invalid file path provided`,
            path,
            toolCallId
          }
        }
        
        const file = await storageManager.getFile(projectId, path)

        if (!file) {
          return { 
            success: false, 
            error: `File not found: ${path}. Use list_files with path parameter to see available files in directories.`,
            path,
            toolCallId
          }
        }

        return { 
          success: true, 
          message: `✅ File ${path} read successfully.`,
          path,
          content: file.content || '',
          name: file.name,
          type: file.type,
          size: file.size,
          action: 'read',
          toolCallId
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[ERROR] read_file failed for ${path}:`, error)
        
        return { 
          success: false, 
          error: `Failed to read file ${path}: ${errorMessage}`,
          path,
          toolCallId
        }
      }
    }
  })

  // Write and delete tools - only available in Agent mode
  if (aiMode === 'agent') {
    tools.write_file = tool({
      description: 'Create a new file with specified content',
      inputSchema: z.object({
        path: z.string().describe('File path relative to project root'),
        content: z.string().describe('File content to write')
      }),
      execute: async ({ path, content }, { abortSignal, toolCallId }) => {
        // Check for cancellation
        if (abortSignal?.aborted) {
          throw new Error('Operation cancelled')
        }
        
        try {
          console.log('[DEBUG] Executing write_file tool:', { path, contentLength: content?.length, projectId })
          
          // Validate inputs
          if (!path || typeof path !== 'string') {
            return { 
              success: false, 
              error: `Invalid file path provided`,
              path,
              toolCallId
            }
          }
          
          if (content === undefined || content === null) {
            return { 
              success: false, 
              error: `Invalid content provided`,
              path,
              toolCallId
            }
          }
          
          // Import storage manager
          const { storageManager } = await import('@/lib/storage-manager')
          await storageManager.init()
          
          // Check if file already exists
          const existingFile = await storageManager.getFile(projectId, path)
          console.log('[DEBUG] write_file file check:', { path, fileExists: !!existingFile })

          if (existingFile) {
            // Update existing file
            await storageManager.updateFile(projectId, path, { content })
            console.log('[DEBUG] write_file updated existing file:', path)
            return { 
              success: true, 
              message: `✅ File ${path} updated successfully.`,
              path,
              action: 'updated',
              toolCallId
            }
          } else {
            // Create new file
            const newFile = await storageManager.createFile({
              workspaceId: projectId,
              name: path.split('/').pop() || path,
              path,
              content,
              fileType: path.split('.').pop() || 'text',
              type: path.split('.').pop() || 'text',
              size: content.length,
              isDirectory: false
            })
            
            console.log('[DEBUG] write_file created new file:', path, newFile.id)
            return { 
              success: true, 
              message: `✅ File ${path} created successfully.`,
              path,
              action: 'created',
              fileId: newFile.id,
              toolCallId
            }
          }
        } catch (error) {
          // Enhanced error handling
          console.error(`[DEBUG] write_file error for ${path}:`, error)
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          
          return { 
            success: false, 
            error: `Failed to write file ${path}: ${errorMessage}`,
            path,
            toolCallId
          }
        }
      }
    })
    
    tools.delete_file = tool({
      description: 'Delete a file from the project',
      inputSchema: z.object({
        path: z.string().describe('File path relative to project root')
      }),
      execute: async ({ path }, { abortSignal, toolCallId }) => {
        // Check for cancellation
        if (abortSignal?.aborted) {
          throw new Error('Operation cancelled')
        }
        
        try {
          // Validate path
          if (!path || typeof path !== 'string') {
            return { 
              success: false, 
              error: `Invalid file path provided`,
              path,
              toolCallId
            }
          }
          
          // Import storage manager
          const { storageManager } = await import('@/lib/storage-manager')
          await storageManager.init()
          
          // Check if file exists
          const existingFile = await storageManager.getFile(projectId, path)

          if (!existingFile) {
            return { 
              success: false, 
              error: `File not found: ${path}. Use list_files to see available files.`,
              path,
              toolCallId
            }
          }

          // Delete the file
          const result = await storageManager.deleteFile(projectId, path)
          
          if (result) {
            return { 
              success: true, 
              message: `✅ File ${path} deleted successfully.`,
              path,
              action: 'deleted',
              toolCallId
            }
          } else {
            return { 
              success: false, 
              error: `Failed to delete file ${path}`,
              path,
              toolCallId
            }
          }
        } catch (error) {
          // Enhanced error handling
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          console.error(`[ERROR] delete_file failed for ${path}:`, error)
          
          return { 
            success: false, 
            error: `Failed to delete file ${path}: ${errorMessage}`,
            path,
            toolCallId
          }
        }
      }
    })

    // Package management tools - only available in Agent mode
    tools.edit_file = tool({
      description: 'Edit an existing file using precise search/replace operations. Provide the search and replace blocks directly as parameters.',
      inputSchema: z.object({
        path: z.string().describe('File path relative to project root to edit'),
        searchReplaceBlocks: z.array(z.object({
          search: z.string().describe('Exact text to find in the file (must match exactly including whitespace)'),
          replace: z.string().describe('Text to replace the search text with'),
          replaceAll: z.boolean().optional().describe('If true, replace all occurrences. If false or omitted, replace only the first occurrence.'),
          occurrenceIndex: z.number().optional().describe('If specified, replace only the Nth occurrence (1-based index). Overrides replaceAll.'),
          validateAfter: z.string().optional().describe('Optional text that should exist in the file after this operation (for validation)')
        })).describe('Array of search/replace operations to perform'),
        dryRun: z.boolean().optional().describe('If true, validate all operations without applying changes'),
        rollbackOnFailure: z.boolean().optional().describe('If true, rollback all changes if any operation fails (default: true)')
      }),
      execute: async ({ path, searchReplaceBlocks, dryRun = false, rollbackOnFailure = true }, { abortSignal, toolCallId }) => {
        // Check for cancellation
        if (abortSignal?.aborted) {
          throw new Error('Operation cancelled')
        }
        
        try {
          // Validate inputs
          if (!path || typeof path !== 'string') {
            return { 
              success: false, 
              error: `Invalid file path provided`,
              path,
              toolCallId
            }
          }

          if (!searchReplaceBlocks || !Array.isArray(searchReplaceBlocks) || searchReplaceBlocks.length === 0) {
            return { 
              success: false, 
              error: `No search/replace blocks provided`,
              path,
              toolCallId
            }
          }

          // Import storage manager
          const { storageManager } = await import('@/lib/storage-manager')
          await storageManager.init()
          
          // Check if file exists
          const existingFile = await storageManager.getFile(projectId, path)

          if (!existingFile) {
            return { 
              success: false, 
              error: `File not found: ${path}. Use list_files to see available files.`,
              path,
              toolCallId
            }
          }

          // Helper functions
          function escapeRegExp(string: string) {
            return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          }

          function findNthOccurrence(content: string, searchText: string, n: number): number {
            let index = -1;
            for (let i = 0; i < n; i++) {
              index = content.indexOf(searchText, index + 1);
              if (index === -1) return -1;
            }
            return index;
          }

          function replaceNthOccurrence(content: string, searchText: string, replaceText: string, n: number): string {
            const index = findNthOccurrence(content, searchText, n);
            if (index === -1) return content;
            return content.substring(0, index) + replaceText + content.substring(index + searchText.length);
          }

          // Initialize tracking arrays
          const appliedEdits: Array<{
            blockIndex: number;
            search: string;
            replace: string;
            status: string;
            replaceAll?: boolean;
            occurrenceIndex?: number;
            occurrencesReplaced?: number;
            validationPassed?: boolean;
          }> = [];
          const failedEdits: Array<{
            blockIndex: number;
            search: string;
            replace: string;
            status: string;
            reason: string;
            validationError?: string;
          }> = [];

          // Store original content for rollback
          const originalContent = existingFile.content;
          let modifiedContent = originalContent;
          const contentSnapshots: string[] = [originalContent];

          // Phase 1: Dry run validation (always performed)
          console.log(`[DEBUG] Starting validation phase for ${searchReplaceBlocks.length} blocks`);

          // Check for duplicate operations within the same request
          const operationSignatures = new Set<string>();
          for (let i = 0; i < searchReplaceBlocks.length; i++) {
            const block = searchReplaceBlocks[i];
            const signature = `${block.search}|${block.replace}`;
            if (operationSignatures.has(signature)) {
              console.warn(`[EDIT_FILE WARNING] Duplicate operation detected in block ${i}: ${signature}`);
            }
            operationSignatures.add(signature);
          }
          
          let tempContent = originalContent;
          const validationResults: Array<{
            blockIndex: number;
            canApply: boolean;
            reason?: string;
            occurrencesFound: number;
          }> = [];

          for (let i = 0; i < searchReplaceBlocks.length; i++) {
            const block = searchReplaceBlocks[i];
            const searchText = block.search;
            const replaceText = block.replace;
            const replaceAll = block.replaceAll || false;
            const occurrenceIndex = block.occurrenceIndex;
            const validateAfter = block.validateAfter;

            // Count occurrences in current temp content
            const occurrences = (tempContent.match(new RegExp(escapeRegExp(searchText), 'g')) || []).length;

            // Check for potential duplicate imports (common issue)
            const isImportAddition = replaceText.includes('import ') && searchText.includes('import ');
            if (isImportAddition) {
              const importPattern = replaceText.match(/import\s+.*?\s+from\s+['"`][^'"`]+['"`]/);
              if (importPattern && tempContent.includes(importPattern[0])) {
                console.warn(`[EDIT_FILE WARNING] Potential duplicate import detected: ${importPattern[0]}`);
              }
            }
            
            let canApply = true;
            let reason = '';

            if (occurrences === 0) {
              canApply = false;
              reason = 'Search text not found in content';
            } else if (occurrenceIndex && occurrenceIndex > occurrences) {
              canApply = false;
              reason = `Requested occurrence ${occurrenceIndex} but only ${occurrences} occurrences found`;
            }

            validationResults.push({
              blockIndex: i,
              canApply,
              reason,
              occurrencesFound: occurrences
            });

            // If this block can be applied, simulate the change for next validation
            if (canApply) {
              if (occurrenceIndex) {
                tempContent = replaceNthOccurrence(tempContent, searchText, replaceText, occurrenceIndex);
              } else if (replaceAll) {
                tempContent = tempContent.replaceAll(searchText, replaceText);
              } else {
                tempContent = tempContent.replace(searchText, replaceText);
              }

              // Validate the content after this change if specified
              if (validateAfter && !tempContent.includes(validateAfter)) {
                canApply = false;
                reason = `Validation failed: expected text "${validateAfter}" not found after operation`;
                validationResults[i].canApply = false;
                validationResults[i].reason = reason;
              }
            }
          }

          // Check if any validations failed
          const failedValidations = validationResults.filter(r => !r.canApply);
          
          if (dryRun) {
            // Return dry run results
            return {
              success: failedValidations.length === 0,
              message: `🔍 Dry run completed. ${validationResults.length - failedValidations.length}/${validationResults.length} operations would succeed.`,
              path,
              action: 'dry_run_completed',
              toolCallId,
              dryRunResults: {
                totalBlocks: searchReplaceBlocks.length,
                validBlocks: validationResults.length - failedValidations.length,
                invalidBlocks: failedValidations.length,
                validationResults,
                previewContent: tempContent
              }
            };
          }

          // Phase 2: Apply changes (only if not dry run)
          console.log(`[DEBUG] Applying ${validationResults.length - failedValidations.length} valid operations`);
          
          for (let i = 0; i < searchReplaceBlocks.length; i++) {
            const block = searchReplaceBlocks[i];
            const validation = validationResults[i];
            
            if (!validation.canApply) {
              failedEdits.push({
                blockIndex: i,
                search: block.search,
                replace: block.replace,
                status: 'failed',
                reason: validation.reason || 'Validation failed'
              });
              
              if (rollbackOnFailure) {
                console.log(`[DEBUG] Block ${i} failed, rolling back all changes`);
                modifiedContent = originalContent;
                return {
                  success: false,
                  error: `Operation ${i + 1} failed: ${validation.reason}. All changes rolled back.`,
                  path,
                  toolCallId,
                  rollbackPerformed: true,
                  failedEdits
                };
              }
              continue;
            }

            const searchText = block.search;
            const replaceText = block.replace;
            const replaceAll = block.replaceAll || false;
            const occurrenceIndex = block.occurrenceIndex;

            // Apply the replacement
            let occurrencesReplaced = 0;
            
            if (occurrenceIndex) {
              modifiedContent = replaceNthOccurrence(modifiedContent, searchText, replaceText, occurrenceIndex);
              occurrencesReplaced = 1;
            } else if (replaceAll) {
              const beforeCount = (modifiedContent.match(new RegExp(escapeRegExp(searchText), 'g')) || []).length;
              modifiedContent = modifiedContent.replaceAll(searchText, replaceText);
              occurrencesReplaced = beforeCount;
            } else {
              modifiedContent = modifiedContent.replace(searchText, replaceText);
              occurrencesReplaced = 1;
            }

            // Validate after replacement if specified
            let validationPassed = true;
            if (block.validateAfter && !modifiedContent.includes(block.validateAfter)) {
              validationPassed = false;
              if (rollbackOnFailure) {
                console.log(`[DEBUG] Post-operation validation failed for block ${i}, rolling back`);
                modifiedContent = originalContent;
                return {
                  success: false,
                  error: `Post-operation validation failed for block ${i + 1}. All changes rolled back.`,
                  path,
                  toolCallId,
                  rollbackPerformed: true,
                  validationError: `Expected text "${block.validateAfter}" not found after operation`
                };
              }
            }

            appliedEdits.push({
              blockIndex: i,
              search: searchText,
              replace: replaceText,
              status: 'applied',
              replaceAll,
              occurrenceIndex,
              occurrencesReplaced,
              validationPassed
            });

            // Take snapshot after each successful operation
            contentSnapshots.push(modifiedContent);
          }

          // Check if any edits were applied
          if (appliedEdits.length === 0) {
            return {
              success: false,
              error: `No changes could be applied. All ${failedEdits.length} search/replace operations failed.`,
              path,
              toolCallId,
              failedEdits
            }
          }

          // Update the file in storage
          await storageManager.updateFile(projectId, path, { 
            content: modifiedContent,
            updatedAt: new Date().toISOString()
          });

          console.log(`[DEBUG] Successfully applied ${appliedEdits.length} edits to ${path}`);
          
          return {
            success: true,
            message: `✅ File ${path} updated successfully. Applied ${appliedEdits.length}/${searchReplaceBlocks.length} changes.`,
            path,
            content: modifiedContent,
            action: 'edit_completed',
            toolCallId,
            appliedEdits,
            failedEdits: failedEdits.length > 0 ? failedEdits : undefined,
            validationResults,
            rollbackOnFailure,
            contentSnapshots: contentSnapshots.length > 2 ? ['original', '...', 'final'] : contentSnapshots.map((_, i) => i === 0 ? 'original' : `step_${i}`)
          }

        } catch (error) {
          // Enhanced error handling
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          console.error(`[ERROR] edit_file failed for ${path}:`, error)

          // Add fallback suggestion for repeated failures
          const fallbackSuggestion = `Consider using write_file tool instead: read the file first, then use write_file to create the complete updated content.`
          
          return { 
            success: false, 
            error: `Failed to edit file ${path}: ${errorMessage}`,
            fallbackSuggestion,
            path,
            toolCallId
          }
        }
      }
    })
  }
  
  // Add web search tool - ONLY when explicitly needed based on intent detection
  if (needsWebTools) {
    tools.web_search = tool({
    description: 'Search the web for current information and context. Returns clean, structured text instead of raw JSON data.',
    inputSchema: z.object({
      query: z.string().describe('Search query to find relevant web content')
    }),
    execute: async ({ query }, { abortSignal, toolCallId }) => {
      if (abortSignal?.aborted) {
        throw new Error('Operation cancelled')
      }
      
      try {
        const searchResults = await searchWeb(query)
        
        return {
          success: true,
          message: `Web search completed successfully for query: "${query}"`,
          // Send clean, structured text instead of raw JSON
          cleanResults: searchResults.cleanedResults,
          // Keep minimal metadata for reference
          metadata: {
            query: searchResults.query,
            resultCount: searchResults.resultCount,
            totalLength: searchResults.cleanedResults.length
          },
          query,
          toolCallId
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('[ERROR] web_search failed:', error)
        
        return { 
          success: false, 
          error: `Web search failed: ${errorMessage}`,
          query,
          toolCallId
        }
      }
    }
  })

    // Add web content extraction tool using AnyAPI - ONLY when explicitly needed
    tools.web_extract = tool({
    description: 'Extract content from web pages using AnyAPI. Returns clean, structured text.',
    inputSchema: z.object({
      urls: z.union([
        z.string().url().describe('URL to extract content from'),
        z.array(z.string().url()).describe('Array of URLs to extract content from')
      ]).describe('URL or URLs to extract content from')
    }),
    execute: async ({ urls }, { abortSignal, toolCallId }) => {
      if (abortSignal?.aborted) {
        throw new Error('Operation cancelled')
      }
      
      // Ensure urls is always an array
      const urlArray = Array.isArray(urls) ? urls : [urls];
      
      try {
        // Import the web scraper
        const { webScraper } = await import('@/lib/web-scraper');
        
        // Process URLs sequentially to manage API key usage
        const extractionResults = await Promise.all(
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
        
        // Separate successful and failed extractions
        const successfulResults = extractionResults.filter(result => result.success);
        const failedResults = extractionResults.filter(result => !result.success);
        
        // Debug logging for final result
        console.log('[DEBUG] Web extract final result:', {
          totalUrls: urlArray.length,
          successfulCount: successfulResults.length,
          failedCount: failedResults.length,
          cleanResultsLength: successfulResults.map(r => r.cleanResults?.length || 0),
          sampleCleanResults: successfulResults[0]?.cleanResults?.substring(0, 100) || 'none'
        });
        
        return {
          success: successfulResults.length > 0,
          message: successfulResults.length > 0 
            ? `Successfully extracted content from ${successfulResults.length} URL(s)` 
            : 'Failed to extract content from any URLs',
          cleanResults: successfulResults.map(result => result.cleanResults).join('\n\n'),
          metadata: {
            successCount: successfulResults.length,
            failedCount: failedResults.length,
            urls: urlArray
          },
          toolCallId
        };
      } catch (error) {
        console.error('[ERROR] Web extract failed:', error);
        
        return { 
          success: false, 
          error: `Web extract failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          cleanResults: '',
          metadata: {
            urls: urlArray
          },
          toolCallId
        };
      }
    }
  })
  } // End conditional for web tools

  // AI-Powered Learning and Pattern Recognition Tool (optimized for minimal token usage)
  // Only include when user is reporting code issues
  if (aiMode === 'agent' && userReportingIssues) { // Re-enabled with strict optimizations
  tools.learn_patterns = tool({
    description: 'Advanced pattern analysis with code metrics, complexity analysis, and actionable recommendations',
    inputSchema: z.object({
      analysisType: z.enum(['coding_style', 'component_patterns', 'technical_decisions', 'optimization_areas', 'code_metrics', 'all']).optional().describe('Type of analysis to perform (default: all)'),
      includeRecommendations: z.boolean().optional().describe('Include improvement recommendations (default: true)'),
      includeMetrics: z.boolean().optional().describe('Include code complexity metrics (default: true)'),
      focusAreas: z.array(z.enum(['performance', 'maintainability', 'security', 'best_practices', 'testing', 'documentation'])).optional().describe('Specific areas to focus on'),
      generateActionItems: z.boolean().optional().describe('Generate specific action items (default: true)'),
      depth: z.enum(['basic', 'detailed', 'comprehensive']).optional().describe('Analysis depth (default: detailed)')
    }),
    execute: async ({
      analysisType = 'all',
      includeRecommendations = true,
      includeMetrics = true,
      focusAreas,
      generateActionItems = true,
      depth = 'detailed'
    }, { abortSignal, toolCallId }) => {
      if (abortSignal?.aborted) {
        throw new Error('Operation cancelled')
      }

      try {
        // Import storage manager
        const { storageManager } = await import('@/lib/storage-manager')
        await storageManager.init()

        // Get conversation memory and project files
        const conversationMemory = await storageManager.getConversationMemory(projectId, global.currentUserId || 'current-user')
        const projectFiles = await storageManager.getFiles(projectId)

        if (!conversationMemory) {
          return {
            success: false,
            error: 'No conversation memory found for pattern analysis',
            toolCallId
          }
        }

        // Enhanced code metrics analysis
        const codeMetrics = includeMetrics ? await (async (projectFiles: any[]) => {
          const metrics = {
            totalFiles: 0,
            totalLines: 0,
            averageFileSize: 0,
            largestFile: { path: '', size: 0 },
            languageDistribution: {} as Record<string, number>,
            complexityIndicators: {
              largeFiles: 0, // > 500 lines
              complexFiles: 0, // > 1000 lines
              testCoverage: 0 // estimated
            },
            maintainability: {
              score: 0,
              factors: [] as string[]
            },
            patterns: {
              hooks: 0,
              components: 0,
              utilities: 0,
              tests: 0,
              configs: 0
            }
          }

          let totalSize = 0

          for (const file of projectFiles) {
            if (file.isDirectory) continue

            metrics.totalFiles++
            const fileSize = file.size || 0
            totalSize += fileSize

            // Track largest file
            if (fileSize > metrics.largestFile.size) {
              metrics.largestFile = { path: file.path, size: fileSize }
            }

            // Language distribution
            const ext = file.path.split('.').pop()?.toLowerCase() || 'unknown'
            metrics.languageDistribution[ext] = (metrics.languageDistribution[ext] || 0) + 1

            // Complexity indicators
            if (fileSize > 1000) {
              metrics.complexityIndicators.complexFiles++
            } else if (fileSize > 500) {
              metrics.complexityIndicators.largeFiles++
            }

            // Pattern detection
            const path = file.path.toLowerCase()
            if (path.includes('test') || path.includes('spec')) {
              metrics.patterns.tests++
            } else if (path.includes('hook')) {
              metrics.patterns.hooks++
            } else if (path.includes('component') || path.includes('.tsx') || path.includes('.jsx')) {
              metrics.patterns.components++
            } else if (path.includes('util') || path.includes('helper')) {
              metrics.patterns.utilities++
            } else if (path.includes('config') || path.includes('.json') || path.includes('.config')) {
              metrics.patterns.configs++
            }
          }

          metrics.totalLines = Math.round(totalSize / 50) // Rough estimation: ~50 chars per line
          metrics.averageFileSize = Math.round(totalSize / metrics.totalFiles)

          // Calculate maintainability score (0-100)
          const maintainabilityFactors = []
          let maintainabilityScore = 100

          if (metrics.complexityIndicators.complexFiles > metrics.totalFiles * 0.1) {
            maintainabilityScore -= 20
            maintainabilityFactors.push('Many complex files')
          }

          if (metrics.averageFileSize > 2000) {
            maintainabilityScore -= 15
            maintainabilityFactors.push('Large average file size')
          }

          if (metrics.patterns.tests < metrics.totalFiles * 0.1) {
            maintainabilityScore -= 10
            maintainabilityFactors.push('Low test coverage')
          }

          metrics.maintainability.score = Math.max(0, maintainabilityScore)
          metrics.maintainability.factors = maintainabilityFactors

          return metrics
        })(projectFiles) : null

        // Use AI to analyze patterns with enhanced context
        const learningInsights = await learnFromPatterns(
          projectId,
          global.currentUserId || 'current-user',
          conversationMemory,
          projectFiles
        )

        // Generate comprehensive analysis report
        const analysisReport = await (async (analysisType: string, insights: any, metrics: any, focusAreas: string[] | undefined, depth: string) => {
          let report = `# Advanced Pattern Analysis Report\n\n**Analysis Type:** ${analysisType}\n**Depth:** ${depth}\n**Focus Areas:** ${focusAreas?.join(', ') || 'All'}\n\n`

          if (metrics && (analysisType === 'code_metrics' || analysisType === 'all')) {
            report += `## 📊 Code Metrics\n\n`
            report += `- **Total Files:** ${metrics.totalFiles}\n`
            report += `- **Total Lines:** ~${metrics.totalLines}\n`
            report += `- **Average File Size:** ${metrics.averageFileSize} bytes\n`
            report += `- **Largest File:** ${metrics.largestFile.path} (${metrics.largestFile.size} bytes)\n`
            report += `- **Maintainability Score:** ${metrics.maintainability.score}/100\n`

            if (metrics.maintainability.factors.length > 0) {
              report += `- **Maintainability Factors:** ${metrics.maintainability.factors.join(', ')}\n`
            }

            report += `\n### Language Distribution\n`
            Object.entries(metrics.languageDistribution).forEach(([lang, count]) => {
              report += `- ${lang}: ${count} files\n`
            })

            report += `\n### Pattern Distribution\n`
            Object.entries(metrics.patterns).forEach(([pattern, count]) => {
              report += `- ${pattern}: ${count} files\n`
            })

            report += `\n### Complexity Indicators\n`
            report += `- Large Files (>500 lines): ${metrics.complexityIndicators.largeFiles}\n`
            report += `- Complex Files (>1000 lines): ${metrics.complexityIndicators.complexFiles}\n`
          }

          if (analysisType === 'coding_style' || analysisType === 'all') {
            report += `\n## 🎨 Coding Style Analysis\n\n`
            report += `**Your Preferred Style:** ${insights.codingStyle}\n\n`
            report += `**Component Patterns:** ${insights.componentPatterns.join(', ')}\n\n`
            report += `**Styling Preferences:** ${insights.stylingPreferences.join(', ')}\n`
          }

          if (analysisType === 'component_patterns' || analysisType === 'all') {
            report += `\n## 🧩 Component Pattern Analysis\n\n`
            report += `**Established Patterns:** ${insights.componentPatterns.join(', ')}\n\n`
            report += `**Technical Decisions:** ${insights.technicalDecisions.join(', ')}\n\n`
            report += `**Common Approaches:** ${insights.commonApproaches.join(', ')}\n`
          }

          if (analysisType === 'technical_decisions' || analysisType === 'all') {
            report += `\n## 🏗️ Technical Decision Analysis\n\n`
            report += `**Architecture Choices:** ${insights.technicalDecisions.join(', ')}\n\n`
            report += `**Common Approaches:** ${insights.commonApproaches.join(', ')}\n\n`
            report += `**Learning Score:** ${Math.round(insights.learningScore * 100)}%\n`
          }

          if (analysisType === 'optimization_areas' || analysisType === 'all') {
            report += `\n## ⚡ Optimization Analysis\n\n`
            report += `**Areas for Improvement:** ${insights.optimizationAreas.join(', ')}\n\n`
            report += `**Recommendations:** ${insights.recommendations.join(', ')}\n`
          }

          return report
        })(analysisType, learningInsights, codeMetrics, focusAreas, depth)

        // Generate actionable recommendations
        const recommendations = includeRecommendations ?
          await (async (insights: any, metrics: any, focusAreas: string[] | undefined) => {
            const recommendations = []

            // Code quality recommendations
            if (metrics?.maintainability?.score < 70) {
              recommendations.push('Consider breaking down large files into smaller, more manageable modules')
              recommendations.push('Implement comprehensive testing to improve maintainability')
            }

            if (metrics?.complexityIndicators?.complexFiles > 0) {
              recommendations.push(`Refactor ${metrics.complexityIndicators.complexFiles} complex files (>1000 lines) into smaller components`)
            }

            // Pattern-based recommendations
            if (insights.componentPatterns?.includes('class components')) {
              recommendations.push('Consider migrating class components to functional components with hooks')
            }

            if (insights.stylingPreferences?.includes('inline styles')) {
              recommendations.push('Move inline styles to CSS modules or styled-components for better maintainability')
            }

            // Focus area specific recommendations
            if (focusAreas?.includes('performance')) {
              recommendations.push('Implement code splitting for better performance')
              recommendations.push('Consider lazy loading for components')
            }

            if (focusAreas?.includes('testing')) {
              recommendations.push('Increase test coverage, especially for complex business logic')
              recommendations.push('Implement integration tests for critical user flows')
            }

            if (focusAreas?.includes('security')) {
              recommendations.push('Review and sanitize user inputs')
              recommendations.push('Implement proper error boundaries')
            }

            return recommendations
          })(learningInsights, codeMetrics, focusAreas) : []

        // Generate specific action items
        const actionItems = generateActionItems ?
          await (async (insights: any, metrics: any, focusAreas: string[] | undefined) => {
            const actionItems = []

            // High-priority action items
            if (metrics?.largestFile?.size > 5000) {
              actionItems.push({
                priority: 'high',
                category: 'refactoring',
                description: `Break down ${metrics.largestFile.path} (${metrics.largestFile.size} bytes) into smaller modules`,
                estimatedEffort: '4-6 hours',
                impact: 'high'
              })
            }

            // Medium-priority items
            if (metrics?.maintainability?.score < 50) {
              actionItems.push({
                priority: 'medium',
                category: 'testing',
                description: 'Implement unit tests for complex functions',
                estimatedEffort: '2-3 hours',
                impact: 'medium'
              })
            }

            // Low-priority items
            if (insights.componentPatterns?.length < 3) {
              actionItems.push({
                priority: 'low',
                category: 'documentation',
                description: 'Document established component patterns and conventions',
                estimatedEffort: '1-2 hours',
                impact: 'low'
              })
            }

            return actionItems
          })(learningInsights, codeMetrics, focusAreas) : []

        return {
          success: true,
          message: `Advanced pattern analysis completed for ${analysisType} (${depth} depth)`,
          analysis: {
            type: analysisType,
            depth,
            report: analysisReport,
            insights: learningInsights,
            metrics: codeMetrics,
            recommendations,
            actionItems,
            learningScore: learningInsights.learningScore,
            focusAreas: focusAreas || ['all'],
            generatedAt: new Date().toISOString()
          },
          toolCallId
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('[ERROR] learn_patterns failed:', error)

        return {
          success: false,
          error: `Advanced pattern analysis failed: ${errorMessage}`,
          toolCallId
        }
      }
    }
  })

  } // End learn_patterns conditional

  // AI Dependency Analyzer - Validates imports and auto-adds missing dependencies
  // ALWAYS INCLUDE - Critical for production-ready code generation
    tools.analyze_dependencies = tool({
      description: 'Analyze project dependencies from all src/app/components/lib/hooks files, validate against package.json, and identify only real npm packages (excludes local UI components)',
      inputSchema: z.object({
        includePackageJson: z.boolean().optional().describe('Include package.json content in analysis (default: true)'),
        autoFix: z.boolean().optional().describe('Automatically suggest package.json updates (default: true)'),
        excludeUI: z.boolean().optional().describe('Exclude UI components from analysis (default: true)')
      }),
      execute: async ({ includePackageJson = true, autoFix = true, excludeUI = true }, { abortSignal, toolCallId }) => {
      if (abortSignal?.aborted) {
        throw new Error('Operation cancelled')
      }
      
      try {
        // Import storage manager
        const { storageManager } = await import('@/lib/storage-manager')
        await storageManager.init()

        // Get package.json
        const packageJsonFile = await storageManager.getFile(projectId, 'package.json')
        if (!packageJsonFile) {
          return {
            success: false,
            error: 'package.json not found',
            toolCallId
          }
        }

        let packageJson: any = {}
        try {
          packageJson = JSON.parse(packageJsonFile.content)
        } catch (error) {
          return {
            success: false,
            error: 'Invalid package.json format',
            toolCallId
          }
        }

        // Get all project files for comprehensive analysis
        const allFiles = await storageManager.getFiles(projectId)

        // Filter relevant files from src, app, components, lib, hooks directories
        const relevantFiles = allFiles.filter(file => {
          if (file.isDirectory) return false

          const path = file.path.toLowerCase()
          const isRelevantDir = path.startsWith('src/') ||
                               path.startsWith('app/') ||
                               path.startsWith('components/') ||
                               path.startsWith('lib/') ||
                               path.startsWith('hooks/') ||
                               path.includes('page.json') ||
                               path.includes('middleware.')

          // Exclude UI components if requested
          if (excludeUI && (
            path.includes('components/ui/') ||
            path.includes('/ui/') ||
            path.includes('shadcn') ||
            path.includes('radix-ui')
          )) {
            return false
          }

          return isRelevantDir
        })

        // Include package.json content if requested (already have it from earlier, but include in analysis)
        let packageJsonContent = ''
        if (includePackageJson && packageJsonFile) {
          packageJsonContent = packageJsonFile.content
        }

        // Extract all imports from relevant files
        const allImports: string[] = []
        const fileContents: string[] = []

        for (const file of relevantFiles.slice(0, 20)) { // Limit to prevent token overflow
          try {
            const fileData = await storageManager.getFile(projectId, file.path)
            if (fileData && fileData.content) {
              const content = fileData.content

              // Extract import statements
              const importMatches = content.match(/import\s+.*?from\s+['"]([^'"]+)['"]/g) || []
              const imports = importMatches.map(match => {
                const fromMatch = match.match(/from\s+['"]([^'"]+)['"]/)
                return fromMatch ? fromMatch[1] : ''
              }).filter(Boolean)

              allImports.push(...imports)
              fileContents.push(`File: ${file.path}\n${content.substring(0, 1000)}`)
            }
          } catch (error) {
            console.warn(`Failed to read ${file.path}:`, error)
          }
        }

        // Use AI to analyze all imports and identify only npm packages
        const mistralPixtral = getMistralPixtralModel()

        const analysisPrompt = `Analyze all import statements from project files and identify ONLY real npm packages.

PROJECT FILES ANALYZED:
${fileContents.join('\n\n---\n\n')}

${packageJsonContent ? `PACKAGE.JSON CONTENT:\n${packageJsonContent}\n\n` : ''}

CURRENT PACKAGE.JSON DEPENDENCIES:
${JSON.stringify({
  dependencies: packageJson.dependencies || {},
  devDependencies: packageJson.devDependencies || {}
}, null, 2)}

INSTRUCTIONS:
1. Extract ALL import statements from the provided files
2. Identify ONLY real npm packages - NEVER suggest local files as missing packages
3. Exclude UI components (Button, Card, Modal, etc.) - these are local components, not npm packages
4. Exclude relative imports (./, ../) - these are local files
5. Exclude path aliases (@/, ~/) - these resolve to local files
6. Only suggest real npm packages like: react, axios, lodash, moment, framer-motion, etc.

REAL NPM PACKAGES EXAMPLES:
✅ axios, lodash, moment, react-router-dom, framer-motion
✅ @types/react, @types/node, @headlessui/react
✅ tailwindcss, clsx, zod, date-fns, uuid
❌ Button, Card, Modal, Input, Select (these are UI components)
❌ ./utils, ../hooks, @/components (these are local files)

Respond with JSON:
{
  "imports": [
    {"package": "axios", "statement": "import axios from 'axios'", "exists": false},
    {"package": "react", "statement": "import React from 'react'", "exists": true}
  ],
  "missingDeps": [
    {"package": "axios", "version": "^1.6.0", "type": "dependency"}
  ],
  "valid": true,
  "summary": "Found X imports, Y missing npm packages",
  "excluded": ["Button", "Card", "Modal"] // List of excluded local components
}`

        const analysis = await generateText({
          model: mistralPixtral,
          messages: [
            { role: 'system', content: 'You are an expert dependency analyzer. Only identify real npm packages, never local files or UI components.' },
            { role: 'user', content: analysisPrompt }
          ],
          temperature: 0.1
        })

        // Parse AI response
        let analysisResult: any = {}
        try {
          let jsonText = analysis.text || '{}'
          if (jsonText.includes('```json')) {
            jsonText = jsonText.replace(/```json\s*/, '').replace(/\s*```$/, '')
          } else if (jsonText.includes('```')) {
            jsonText = jsonText.replace(/```\s*/, '').replace(/\s*```$/, '')
          }
          jsonText = jsonText.trim()

          // Find JSON object bounds
          const startIndex = jsonText.indexOf('{')
          const endIndex = jsonText.lastIndexOf('}')
          if (startIndex !== -1 && endIndex !== -1) {
            jsonText = jsonText.substring(startIndex, endIndex + 1)
          }

          analysisResult = JSON.parse(jsonText)
        } catch (parseError) {
          console.warn('Failed to parse dependency analysis, using fallback')
          analysisResult = {
            imports: [],
            missingDeps: [],
            valid: true,
            summary: 'Analysis completed with fallback parsing',
            excluded: []
          }
        }
        
        // AUTO-FIX: Add missing dependencies to package.json using edit_file tool
        let packageJsonUpdated = false
        const addedDependencies: string[] = []
        
        if (autoFix && analysisResult.missingDeps?.length > 0) {
          try {
            for (const missingDep of analysisResult.missingDeps) {
              const packageName = missingDep.package
              const version = missingDep.version || '^1.0.0' // Default version if AI doesn't provide one
              const depType = missingDep.type || 'dependency'
              
              // Determine which section to update
              const sectionKey = depType === 'devDependency' ? 'devDependencies' : 'dependencies'
              const currentSection = packageJson[sectionKey] || {}
              
              // Skip if package already exists
              if (currentSection[packageName]) {
                continue
              }
              
              // Use edit_file logic to add the dependency
              try {
                // Update the in-memory package.json object
                const updatedPackageJson = { ...packageJson }
                
                if (depType === 'devDependency') {
                  updatedPackageJson.devDependencies = updatedPackageJson.devDependencies || {}
                  updatedPackageJson.devDependencies[packageName] = version
                } else {
                  updatedPackageJson.dependencies = updatedPackageJson.dependencies || {}
                  updatedPackageJson.dependencies[packageName] = version
                }
                
                // Update the file using storage manager
                await storageManager.updateFile(projectId, 'package.json', {
                  content: JSON.stringify(updatedPackageJson, null, 2),
                  updatedAt: new Date().toISOString()
                })
                
                addedDependencies.push(`${packageName}@${version} (${depType})`)
                packageJsonUpdated = true
                
                console.log(`[DEPENDENCY AUTO-FIX] Added ${packageName}@${version} to ${sectionKey}`)
              } catch (editError) {
                console.warn(`[DEPENDENCY AUTO-FIX] Failed to add ${packageName}:`, editError)
              }
            }
          } catch (autoFixError) {
            console.error('[ERROR] Auto-fix dependencies failed:', autoFixError)
          }
        }
        
        // Build response
        const analyzedFilesCount = relevantFiles.length
        const totalImports = analysisResult.imports?.length || 0
        const missingDepsCount = analysisResult.missingDeps?.length || 0
        const excludedComponents = analysisResult.excluded?.length || 0

        const result = {
          success: true,
          message: packageJsonUpdated ?
            `Dependencies auto-added to package.json: ${addedDependencies.join(', ')}` :
            `Dependency analysis completed: ${analyzedFilesCount} files analyzed, ${totalImports} imports found, ${missingDepsCount} missing packages, ${excludedComponents} local components excluded`,
          analysis: {
            analyzedFiles: analyzedFilesCount,
            filesList: relevantFiles.slice(0, 10).map(f => f.path), // Show first 10 files
            imports: analysisResult.imports || [],
            missingDependencies: analysisResult.missingDeps || [],
            excludedComponents: analysisResult.excluded || [],
            isValid: analysisResult.valid !== false || packageJsonUpdated,
            summary: analysisResult.summary || 'Dependencies validated',
            autoFixed: packageJsonUpdated,
            addedDependencies: addedDependencies,
            suggestions: packageJsonUpdated ?
              [`Run 'npm install' to install the newly added dependencies`] :
              (analysisResult.missingDeps?.map((dep: any) => `npm install ${dep.package}`) || []),
            packageJsonIncluded: includePackageJson && packageJsonContent !== '',
            uiComponentsExcluded: excludeUI
          },
          toolCallId
        }
        
        // Log issues if any
        if (analysisResult.missingDeps?.length > 0) {
          console.warn(`[DEPENDENCY WARNING] Missing npm packages across ${analyzedFilesCount} files:`, analysisResult.missingDeps)
        }

        if (excludedComponents > 0) {
          console.log(`[DEPENDENCY INFO] Excluded ${excludedComponents} local components from npm package detection:`, analysisResult.excluded)
        }
        
        return result
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('[ERROR] analyze_dependencies failed:', error)
        
        return { 
          success: false, 
          error: `Dependency analysis failed: ${errorMessage}`,
          toolCallId
        }
      }
    }
  })

  // AI Code Scanner - Validates import/export relationships between project files
  // Only include when user is reporting code issues
  if (userReportingIssues) {
    tools.scan_code_imports = tool({
    description: 'Advanced code scanner with comprehensive project context - validates imports/exports, provides file relationships, and project structure analysis',
    inputSchema: z.object({
      filePath: z.string().describe('Path of the file to scan'),
      fileContent: z.string().describe('Complete content of the file to scan'),
      includeProjectContext: z.boolean().optional().describe('Include comprehensive project src directory context (default: true)'),
      validateExports: z.boolean().optional().describe('Validate export/import relationships (default: true)'),
      analyzeDependencies: z.boolean().optional().describe('Analyze file dependencies and relationships (default: true)')
    }),
    execute: async ({ filePath, fileContent, includeProjectContext = true, validateExports = true, analyzeDependencies = true }, { abortSignal, toolCallId }) => {
      if (abortSignal?.aborted) {
        throw new Error('Operation cancelled')
      }
      
      try {
        // Import storage manager
        const { storageManager } = await import('@/lib/storage-manager')
        await storageManager.init()
        
        // Get all project files for comprehensive analysis
        const allProjectFiles = await storageManager.getFiles(projectId)
        
        // FILE CONTEXT ANALYSIS
        const fileDir = filePath.substring(0, filePath.lastIndexOf('/'))
        const fileName = filePath.split('/').pop() || ''
        const fileExtension = fileName.split('.').pop() || ''

        // Helper function to extract top-level and key definitions from files
        const extractDefinitions = (content: string, filePath: string): string[] => {
          const definitions: string[] = []

          if (filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
            // Extract exports (functions, classes, constants, types)
            const exportMatches = content.match(/export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g) || []
            exportMatches.forEach(match => {
              const name = match.replace(/export\s+(?:const|let|var|function|class|interface|type|enum)\s+/, '')
              definitions.push(`export ${name}`)
            })

            // Extract named exports
            const namedExportMatches = content.match(/export\s*{\s*([^}]+)\s*}/g) || []
            namedExportMatches.forEach(match => {
              const exports = match.match(/{([^}]+)}/)?.[1]?.split(',').map(e => e.trim()) || []
              exports.forEach(exp => definitions.push(`export ${exp}`))
            })

            // Extract default export
            if (content.includes('export default')) {
              definitions.push('export default')
            }

            // Extract function declarations (non-exported)
            const functionMatches = content.match(/(?:^|\n)\s*(?:function|const|let|var)\s+(\w+)\s*[=(]/g) || []
            functionMatches.forEach(match => {
              const name = match.replace(/(?:^|\n)\s*(?:function|const|let|var)\s+/, '').replace(/\s*[=(].*/, '')
              if (!definitions.includes(`export ${name}`) && !definitions.includes(name)) {
                definitions.push(`function ${name}`)
              }
            })

            // Extract React components
            const componentMatches = content.match(/(?:export\s+)?(?:const|function)\s+(\w+)\s*(?:\([^)]*\)\s*)?[:=]\s*(?:\([^)]*\)\s*=>\s*)?\{/g) || []
            componentMatches.forEach(match => {
              const name = match.replace(/(?:export\s+)?(?:const|function)\s+/, '').replace(/\s*(?:\([^)]*\)\s*)?[:=].*/, '')
              if (name && name[0] === name[0].toUpperCase() && !definitions.includes(`export ${name}`)) {
                definitions.push(`component ${name}`)
              }
            })
          }

          return definitions.slice(0, 10) // Limit to prevent token overflow
        }

        // DIRECTORY STRUCTURE ANALYSIS - Focus on relevant directories
        const directoryStructure: Record<string, Array<{name: string, type: string, size: number, definitions?: string[]}>> = {}
        const relevantFiles: any[] = []

        // Relevant directories to scan for definitions
        const relevantDirectories = [
          'app/', 'components/', 'lib/', 'hooks/',
          'pages/', 'src/', './src/', 'layouts/', 'middleware.'
        ]

        // Build comprehensive project structure focusing on relevant files
        for (const file of allProjectFiles) {
          await (async () => {
          if (!file.isDirectory &&
          !file.path.includes('node_modules') &&
              !file.path.includes('.shadcn') &&
              !file.path.includes('shadcn-ui') &&
              !file.path.includes('components/ui/') &&
              !file.path.includes('public/') &&
              !file.path.includes('styles/') &&
              !file.path.includes('scripts/') &&
              !file.path.includes('templates/') &&
              !file.path.includes('supabase/migrations/') &&
              !file.path.includes('__tests__/')) {

            // Check if file is in relevant directories
            const isRelevant = relevantDirectories.some(dir =>
              file.path.startsWith(dir) ||
              (dir.endsWith('.') && file.path.includes(dir))
            )

            if (isRelevant) {
              // Categorize files by directory
              const dirPath = file.path.substring(0, file.path.lastIndexOf('/')) || '/'
              if (!directoryStructure[dirPath]) {
                directoryStructure[dirPath] = []
              }

              // Extract top-level and key definitions
              let definitions: string[] = []
              try {
                const currentFile = await storageManager.getFile(projectId, file.path)
                if (currentFile && currentFile.content) {
                  definitions = extractDefinitions(currentFile.content, file.path)
                } else {
                  definitions = ['file not found']
                }
              } catch (error) {
                definitions = ['error reading file']
              }

              directoryStructure[dirPath].push({
                name: file.path.split('/').pop() || 'unknown',
                type: file.path.split('.').pop() || 'unknown',
                size: file.size,
                definitions: definitions
              })

              // Collect relevant files with definitions
              relevantFiles.push({
                path: file.path,
                name: file.path.split('/').pop() || 'unknown',
                type: file.path.split('.').pop() || 'unknown',
                size: file.size,
                isRelevant: true,
                definitions: definitions,
                directory: dirPath
              })
            }
          }
          })()
        }

        // ENHANCED PROJECT CONTEXT
        const projectContext = {
          totalFiles: allProjectFiles.filter(f => !f.isDirectory).length,
          relevantFiles: relevantFiles.length,
          directories: Object.keys(directoryStructure).length,
          structure: directoryStructure,
          relevantFileList: relevantFiles.slice(0, 50), // Limit for token efficiency
          targetFile: {
            path: filePath,
            directory: fileDir,
            name: fileName,
            extension: fileExtension,
            size: fileContent.length,
            definitions: extractDefinitions(fileContent, filePath)
          }
        }

        // ADVANCED IMPORT/EXPORT ANALYSIS
        const importExportAnalysis: any = {}

        // Extract imports from current file
        const importMatches = fileContent.match(/import\s+.*?from\s+['"]([^'"]+)['"]/g) || []
        const currentFileImports = importMatches.map(match => {
          const fromMatch = match.match(/from\s+['"]([^'"]+)['"]/)
          return fromMatch ? fromMatch[1] : ''
        }).filter(Boolean)

        // Analyze each import
        for (const importPath of currentFileImports) {
          const analysis: any = {
            rawImport: importPath,
            resolvedPath: '',
            exists: false,
            type: 'unknown',
            suggestions: []
          }

          // Resolve relative imports
          if (importPath.startsWith('./') || importPath.startsWith('../')) {
            let resolvedPath = importPath
            if (importPath.startsWith('./')) {
              resolvedPath = fileDir + '/' + importPath.substring(2)
            } else if (importPath.startsWith('../')) {
              const parentDir = fileDir.substring(0, fileDir.lastIndexOf('/'))
              resolvedPath = parentDir + '/' + importPath.substring(3)
            }

            // Try different extensions
            const possiblePaths = [
              resolvedPath,
              resolvedPath + '.ts',
              resolvedPath + '.tsx',
              resolvedPath + '.js',
              resolvedPath + '.jsx',
              resolvedPath + '/index.ts',
              resolvedPath + '/index.tsx',
              resolvedPath + '/index.js',
              resolvedPath + '/index.jsx'
            ]

            for (const possiblePath of possiblePaths) {
              const foundFile = allProjectFiles.find(f =>
                !f.isDirectory && f.path === possiblePath
              )
              if (foundFile) {
                analysis.resolvedPath = possiblePath
                analysis.exists = true
                analysis.type = 'relative'
                break
              }
            }
          } else {
            // Absolute imports - check if they exist in project
            const foundFile = allProjectFiles.find(f =>
              !f.isDirectory && f.path === importPath
            )
            if (foundFile) {
              analysis.resolvedPath = importPath
              analysis.exists = true
              analysis.type = 'absolute'
            } else {
              analysis.type = 'external'
              analysis.exists = true // Assume external dependencies exist
            }
          }

          importExportAnalysis[importPath] = analysis
        }

        // Use AI for advanced analysis with comprehensive context
        const mistralPixtral = getMistralPixtralModel()
        
        const enhancedScanPrompt = `🔍 **ADVANCED CODE SCANNER** - Comprehensive Import/Export Analysis

📄 **CURRENT FILE ANALYSIS:**
Path: ${filePath}
Directory: ${fileDir}
Name: ${fileName}
Extension: ${fileExtension}
Size: ${fileContent.length} characters
Definitions: ${projectContext.targetFile.definitions?.join(', ') || 'None found'}

📝 **COMPLETE FILE CONTENT:**
\`\`\`${fileExtension}
${fileContent}
\`\`\`

🏗️ **PROJECT CONTEXT:**
${includeProjectContext ? `
Total Files: ${projectContext.totalFiles}
Relevant Files: ${projectContext.relevantFiles}
Directories: ${projectContext.directories}

📂 **RELEVANT FILES STRUCTURE (app/, components/, lib/, hooks/):**
${JSON.stringify(projectContext.relevantFileList.slice(0, 20), null, 2)}

📁 **DIRECTORY BREAKDOWN WITH DEFINITIONS:**
${Object.entries(directoryStructure).slice(0, 10).map(([dir, files]: [string, Array<{name: string, type: string, size: number, definitions?: string[]}>]) =>
  `${dir}: ${files.length} files\n${files.slice(0, 3).map(f => `  - ${f.name} (${f.definitions?.join(', ') || 'no definitions'})`).join('\n')}`
).join('\n\n')}

` : 'Project context excluded for focused analysis'}

🔍 **IMPORT ANALYSIS:**
${Object.entries(importExportAnalysis).map(([importPath, analysis]: [string, any]) =>
  `${importPath}:
  - Resolved: ${analysis.resolvedPath || 'Not found'}
  - Exists: ${analysis.exists}
  - Type: ${analysis.type}
  - Suggestions: ${analysis.suggestions.join(', ') || 'None'}`
).join('\n\n')}

🎯 **VALIDATION REQUIREMENTS:**
1. **File Existence**: Verify all imported files exist in project
2. **Path Resolution**: Confirm relative paths resolve correctly
3. **Export Matching**: Validate imports match actual exports
4. **Syntax Correctness**: Check import/export syntax validity
5. **Dependency Chain**: Analyze import dependency relationships
${analyzeDependencies ? '6. **Circular Dependencies**: Detect potential circular import issues' : ''}

📊 **RESPONSE FORMAT:**
\`\`\`json
{
  "fileAnalysis": {
    "path": "${filePath}",
    "imports": ${JSON.stringify(Object.keys(importExportAnalysis))},
    "exports": [],
    "complexity": "simple|medium|complex"
  },
  "importValidation": [
    {
      "import": "./Component",
      "resolved": "src/components/Component.tsx",
      "exists": true,
      "exportType": "default|named|both",
      "valid": true,
      "issues": []
    }
  ],
  "projectInsights": {
    "relevantFiles": ${projectContext.relevantFiles},
    "directoryCount": ${projectContext.directories},
    "importPatterns": [],
    "potentialIssues": []
  },
  "recommendations": [
    "Consider using absolute imports for better maintainability",
    "Missing type definitions for external dependencies"
  ],
  "valid": true,
  "summary": "Comprehensive analysis completed with detailed findings"
}
\`\`\`

**Focus Areas:**
- Import resolution accuracy
- Export/import type matching
- Project structure optimization
- Dependency relationship analysis
- Code organization recommendations`
        
        const scanResult = await generateText({
          model: mistralPixtral,
          messages: [
            { role: 'system', content: 'You are an advanced code analysis expert. Provide comprehensive import/export validation with project context awareness. Respond with detailed JSON analysis.' },
            { role: 'user', content: enhancedScanPrompt }
          ],
          temperature: 0.1
        })
        
        // Enhanced AI response parsing
        let scanAnalysis: any = {}
        try {
          let jsonText = scanResult.text || '{}'

          // Extract JSON from various formats
          if (jsonText.includes('```json')) {
            jsonText = jsonText.replace(/```json\s*/, '').replace(/\s*```$/, '')
          } else if (jsonText.includes('```')) {
            const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
            if (jsonMatch) {
              jsonText = jsonMatch[1]
          }
          }

          jsonText = jsonText.trim()
          
          // Find JSON object bounds
          const startIndex = jsonText.indexOf('{')
          const endIndex = jsonText.lastIndexOf('}')
          if (startIndex !== -1 && endIndex !== -1) {
            jsonText = jsonText.substring(startIndex, endIndex + 1)
          }
          
          scanAnalysis = JSON.parse(jsonText)
        } catch (parseError) {
          console.warn('Failed to parse enhanced code scan analysis, using fallback')
          scanAnalysis = {
            fileAnalysis: {
              path: filePath,
              imports: Object.keys(importExportAnalysis),
              exports: [],
              complexity: 'unknown'
            },
            importValidation: Object.entries(importExportAnalysis).map(([importPath, analysis]: [string, any]) => ({
              import: importPath,
              resolved: analysis.resolvedPath,
              exists: analysis.exists,
              exportType: 'unknown',
              valid: analysis.exists,
              issues: analysis.exists ? [] : [`File not found: ${analysis.resolvedPath || importPath}`]
            })),
            projectInsights: {
              relevantFiles: projectContext.relevantFiles,
              directoryCount: projectContext.directories,
              importPatterns: [],
              potentialIssues: ['Analysis parsing failed - using basic validation']
            },
            recommendations: ['Consider running full analysis with project context enabled'],
            valid: true,
            summary: 'Enhanced scan completed with fallback parsing'
          }
        }
        
        // Build comprehensive response with rich context
        const result = {
          success: true,
          message: `🔍 Enhanced code scan completed for ${filePath}`,
          analysis: {
            fileAnalysis: scanAnalysis.fileAnalysis || {},
            importValidation: scanAnalysis.importValidation || [],
            projectInsights: scanAnalysis.projectInsights || {},
            recommendations: scanAnalysis.recommendations || [],
            isValid: scanAnalysis.valid !== false,
            summary: scanAnalysis.summary || 'Enhanced code scan completed',
            contextUsed: {
              projectFiles: projectContext.totalFiles,
              relevantFiles: projectContext.relevantFiles,
              directoriesAnalyzed: projectContext.directories,
              importsAnalyzed: Object.keys(importExportAnalysis).length
            }
          },
          toolCallId
        }

        // Enhanced logging with context
        console.log(`[ENHANCED CODE SCAN] Completed for ${filePath}:`, {
          importsAnalyzed: Object.keys(importExportAnalysis).length,
          relevantFiles: projectContext.relevantFiles,
          directories: projectContext.directories,
          isValid: scanAnalysis.valid !== false,
          issuesFound: scanAnalysis.importValidation?.filter((v: any) => !v.valid).length || 0
        })
        
        // Log issues if any
        if (scanAnalysis.importValidation?.some((v: any) => !v.valid)) {
          console.warn(`[CODE SCAN WARNING] Import issues found in ${filePath}:`,
            scanAnalysis.importValidation.filter((v: any) => !v.valid)
          )
        }
        
        return result
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('[ERROR] Enhanced scan_code_imports failed:', error)
        
        return { 
          success: false, 
          error: `Enhanced code scan failed: ${errorMessage}`,
          toolCallId
        }
      }
    }
  })

  } // End conditional for scan_code_imports

  // Debug logging to show which tools are included
  const toolNames = Object.keys(tools)

  console.log('[DEBUG] Final Tool Set:', {
    totalTools: toolNames.length,
    toolNames: toolNames.sort(),
    hasWebSearch: toolNames.includes('web_search'),
    hasWebExtract: toolNames.includes('web_extract'),
    hasReadFile: toolNames.includes('read_file'),
    hasWriteFile: toolNames.includes('write_file'),
    hasEditFile: toolNames.includes('edit_file')
  })

  return tools
}

// NLP Intent Detection using Mistral Pixtral
async function detectUserIntent(userMessage: string, projectContext: string, conversationHistory: any[]) {
  try {
    const mistralPixtralModel = getMistralPixtralModel()
    
    const intentPrompt = `Analyze the user's request and determine their intent for building or modifying a React application.

🚨 CRITICAL RULES - READ FIRST:
- NEVER recommend web_search or web_extract unless user EXPLICITLY asks for web research
- For file modifications, product additions, or code changes, recommend ONLY list_files, read_file, write_file
- Web tools are FORBIDDEN for basic development tasks
- If user wants to add products, edit files, or modify code, use file operations only

User Message: "${userMessage}"

Project Context: ${projectContext}

Recent Conversation History (last 5 exchanges):
${(conversationHistory || []).slice(-10).map((msg, i) => `${msg.role}: ${msg.content}`).join('\n')}

Based on the user's request, determine:
1. **Primary Intent**: What does the user want to accomplish?
2. **Required Tools**: Which tools should be used? (PREFER list_files, read_file, write_file, delete_file - AVOID web_search, web_extract unless explicitly requested)
3. **File Operations**: What files need to be created, modified, or deleted?
4. **Complexity Level**: Simple, Medium, or Complex task?
5. **Action Plan**: Step-by-step plan to accomplish the task
6. **Architecture Impact**: Does this require layout.tsx changes? (Next.js only)

📝 **TOOL SELECTION RULES:**
- File operations (add products, edit code) → use read_file + write_file
- Web research (search online, external content) → use web_search + web_extract
- When in doubt, choose file operations over web tools

🏗️ **ARCHITECTURE AWARENESS:**
**Next.js Projects** (detect by next.config.js):
- Check if feature needs global providers → layout.tsx modification required
- Check if feature needs metadata updates → layout.tsx modification required
- Check if feature needs global state → layout.tsx modification required
- Check if feature is component-only → NO layout.tsx changes needed

**Examples:**
- "Add authentication" → layout.tsx needs AuthProvider wrapper
- "Add dark mode" → layout.tsx needs ThemeProvider wrapper
- "Add new product page" → NO layout.tsx changes, just create new route
- "Add analytics" → layout.tsx needs global analytics script
- "Create contact form" → NO layout.tsx changes, just component work

**Vite Projects** (detect by vite.config.ts):
- Check if feature needs global providers → main.tsx modification required
- Check if feature needs routes → App.tsx modification required
- Component-only features → NO entry file changes

📋 **EXAMPLE SCENARIOS:**
- User: "add more products" → required_tools: ["read_file", "write_file"], tool_usage_rules: "Use file operations only. NO web tools needed."
- User: "search for jewelry trends online" → required_tools: ["web_search", "web_extract"], tool_usage_rules: "Web research requested - use web tools appropriately."
- User: "add authentication" → required_tools: ["read_file", "write_file"], affected_files: ["src/app/layout.tsx", "src/components/auth/..."], architecture_note: "Requires layout.tsx modification for AuthProvider"
- User: "create a new product card" → affected_files: ["src/components/ProductCard.tsx"], architecture_note: "Component-only, no layout changes needed"

Respond in JSON format:
{
  "intent": "string",
  "required_tools": ["tool1", "tool2"],
  "file_operations": ["create", "modify", "delete"],
  "affected_files": ["layout.tsx", "page.tsx"],
  "layout_modification_needed": true,
  "layout_modification_reason": "string",
  "complexity": "simple|medium|complex",
  "action_plan": ["step1", "step2"],
  "confidence": 0.95,
  "tool_usage_rules": "string",
  "enforcement_notes": "string",
  "architecture_impact": "string"
}

Include these fields:
- "affected_files": List of specific files that will be modified
- "layout_modification_needed": Boolean indicating if layout.tsx/main.tsx needs changes
- "layout_modification_reason": Explanation of why layout modification is needed
- "architecture_impact": How this feature affects the app's architecture
- "tool_usage_rules": Specific rules about when to use each tool type
- "enforcement_notes": Critical reminders about web tool restrictions`

    const intentResult = await generateText({
      model: mistralPixtralModel,
      messages: [
          { role: 'system', content: `You are an AI intent detection specialist with deep understanding of React application architecture. Analyze user requests and provide structured intent analysis.

🚨 CRITICAL RULES:
- NEVER recommend web_search or web_extract unless user EXPLICITLY asks for web research
- For file modifications, product additions, or code changes, recommend ONLY list_files, read_file, write_file
- Web tools are FORBIDDEN for basic development tasks
- When in doubt, choose file operations over web tools

🏗️ ARCHITECTURE EXPERTISE:
- **Next.js App Router**: Understand layout.tsx hierarchy and when it needs modification
- **Global State**: Identify when features need layout.tsx providers (auth, theme, state management)
- **Metadata**: Recognize when layout.tsx metadata exports need updates
- **Component-Only**: Distinguish between component-level and architecture-level changes
- **Vite Projects**: Know when main.tsx/App.tsx needs modification vs component-only changes

🎯 KEY DECISIONS YOU MAKE:
1. Does this feature need global providers? → layout.tsx modification
2. Does this feature need metadata updates? → layout.tsx modification
3. Is this just a new page/component? → NO layout.tsx changes
4. Does this need global fonts/scripts? → layout.tsx modification` },
        { role: 'user', content: intentPrompt }
      ],
      temperature: 0.3
    })

    try {
      // Extract JSON from markdown response if present
      let jsonText = intentResult.text
      
      // Remove markdown code blocks if present
      if (jsonText.includes('```json')) {
        jsonText = jsonText.replace(/```json\s*/, '').replace(/\s*```$/, '')
      } else if (jsonText.includes('```')) {
        jsonText = jsonText.replace(/```\s*/, '').replace(/\s*```$/, '')
      }
      
      // Clean up any remaining markdown formatting
      jsonText = jsonText.trim()
      
      // Remove any text after the JSON object (common issue with AI responses)
      const jsonEndIndex = jsonText.lastIndexOf('}')
      if (jsonEndIndex !== -1) {
        jsonText = jsonText.substring(0, jsonEndIndex + 1)
      }
      
      console.log('[DEBUG] Extracted JSON text for parsing:', jsonText.substring(0, 200) + '...')
      
      const intentData = JSON.parse(jsonText)
      return intentData
    } catch (parseError) {
      console.warn('Failed to parse intent detection result:', parseError)
      console.log('[DEBUG] Raw intent result text:', intentResult.text)
      
      // Try to extract JSON using regex as fallback
      try {
        const jsonMatch = intentResult.text.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const extractedJson = jsonMatch[0]
          console.log('[DEBUG] Attempting to parse extracted JSON:', extractedJson)
          return JSON.parse(extractedJson)
        }
      } catch (fallbackError) {
        console.warn('Fallback JSON extraction also failed:', fallbackError)
      }
      
      return {
        intent: 'general_development',
        required_tools: ['list_files', 'read_file'],
        file_operations: ['analyze'],
        complexity: 'medium',
        action_plan: ['Analyze current project state', 'Provide guidance'],
        confidence: 0.7,
        tool_usage_rules: 'Use list_files, read_file, write_file for file operations. Avoid web tools unless explicitly requested.',
        enforcement_notes: 'Web tools (web_search, web_extract) are FORBIDDEN for basic development tasks. Stick to file operations.'
      }
    }
  } catch (error) {
    console.error('Intent detection failed:', error)
    return {
      intent: 'general_development',
      required_tools: ['list_files', 'read_file'],
      file_operations: ['analyze'],
      complexity: 'medium',
      action_plan: ['Analyze current project state', 'Provide guidance'],
      confidence: 0.5,
      tool_usage_rules: 'Use list_files, read_file, write_file for file operations. Avoid web tools unless explicitly requested.',
      enforcement_notes: 'Web tools (web_search, web_extract) are FORBIDDEN for basic development tasks. Stick to file operations.'
    }
  }
}

// Focused System Prompts for Two-Phase Architecture
function getPreprocessingSystemPrompt(): string {
  return `🔍 **PIXEL FORGE - INFORMATION GATHERING PHASE**

You are a specialized code analysis assistant in the preprocessing phase. Your role is to intelligently gather information to understand the current codebase state.

**🎯 PRIMARY OBJECTIVES:**
- Read and analyze files to understand current implementation
- List directories to understand project structure  
- Search for information when requested
- Extract and analyze dependencies
- Gather comprehensive context for the implementation phase
- **Identify framework architecture** (Next.js vs Vite) and critical entry files
- **Assess architecture impact** of requested features (does it need layout.tsx/main.tsx changes?)
- When users report errors pointing to specific files, thoroughly use the read_file tool to read all the multiple files.

**📂 PATH RESOLUTION RULES:**
- User logs showing **/project/src/** → actual path is **src/** (we're in project root)
- NO need to add /project/ prefix to paths
- Always use relative paths from project root

**🏗️ ARCHITECTURE-AWARE CONTEXT GATHERING:**
When gathering context, identify:
1. **Framework Type**: Check for next.config.js (Next.js) or vite.config.ts (Vite)
2. **Entry Files**: Read layout.tsx (Next.js) or main.tsx (Vite) if feature needs global changes
3. **Feature Scope**: Determine if component-only or requires architecture-level changes
4. **Provider Needs**: Check if feature needs global providers (auth, theme, state)
5. **Metadata Needs**: Check if feature needs SEO/metadata updates (layout.tsx)

**🛠️ AVAILABLE TOOLS:**
- read_file: Read file contents for analysis
- web_search: Search for external information when needed
- web_extract: Extract content from web resources

**🚫 RESTRICTIONS:**
- Do NOT attempt to write, edit, or delete files
- Do NOT provide implementation solutions yet
- Focus ONLY on information gathering and analysis
- Provide thorough understanding of current state

**📊 RESPONSE REQUIREMENTS:**
- Be thorough and comprehensive in your analysis
- Identify relevant files, patterns, and structures
- Note any potential issues or areas of interest
- Prepare detailed context for the implementation phase
- Use clear, organized formatting with proper markdown

**🎪 ANALYSIS APPROACH:**
- Start with broad structure understanding (list_files)
- Read specific files for detailed implementation analysis
- Identify patterns, conventions, and architectural decisions
- Note dependencies and external integrations
- Document current state comprehensively

**🏗️ FRAMEWORK-SPECIFIC ANALYSIS:**

**For Next.js Projects (check for next.config.js):**
- **src/app/layout.tsx**: Root layout wrapping all pages - contains providers, metadata, fonts
- **src/app/page.tsx**: Home page entry point
- **App Router Structure**: File-system based routing in src/app/
- **Layout Hierarchy**: Nested layouts for route groups
- **Key Files to Check**: layout.tsx files when analyzing new features that may need global state

**For Vite Projects (check for vite.config.ts):**
- **src/main.tsx**: Application entry point
- **src/App.tsx**: Root component
- **Client-Side Routing**: React Router DOM for navigation
- **Key Files to Check**: main.tsx and App.tsx for provider setup

**🔍 WHEN ANALYZING FEATURE REQUESTS:**
1. Identify if feature needs **global state/providers** (→ check layout.tsx/main.tsx)
2. Identify if feature needs **new routes** (→ App Router vs React Router patterns)
3. Identify if feature needs **metadata updates** (→ layout.tsx metadata exports)
4. Identify if feature is **component-level** (→ no layout changes needed)

Remember: This is the INFORMATION GATHERING phase. Your job is to understand and analyze, not to implement. Pay special attention to the project's framework architecture when analyzing where changes need to be made.`
}


function getStreamingSystemPrompt(projectContext?: string, memoryContext?: any, template?: 'vite-react' | 'nextjs', conversationHistory?: string): string {
  // Determine if this is a Next.js project
  const isNextJS = template === 'nextjs'

  return `<instructions>
You are PiPilot, a senior software engineer with 10+ years of experience across full-stack development, systems architecture, and polyglot programming. You possess deep expertise in building production-grade applications, solving complex technical challenges, and delivering pixel-perfect, fully functional features autonomously, making changes to their code through JSON tool commands that execute immediately during our conversation.

🎉 Use emojis naturally in your responses to keep conversations engaging and make technical discussions more approachable! 🚀

**Core Principles:**
- Always use the write_file tool for file creation and updates
- Make efficient and effective changes to codebases while following best practices for maintainability and readability
- Take pride in keeping things simple and elegant
- Be friendly and helpful, always aiming to provide clear explanations
- Understand that users can see a live preview of their application while you make code changes, and all file operations execute immediately through JSON commands
**Available Tools: write_file, delete_file, remove_package**
- 🚨 **CRITICAL**: Never use any other JSON tool apart from the four mentioned above
**IMPORTANT NOTE:**
Always ensure that all announced file creations or updates are immediately followed by the appropriate JSON tool commands (e.g.,\`write_file\`) to actually perform those actions. Do NOT simply announce an intent to create or update a file without executing the relevant tool action. Every step that changes the codebase, whether it's creating a file or updating content, MUST use the corresponding tool. This is essential for code traceability and immediate execution.
If you ever find that you announced an action (like creating a new file or updating content) but didn't use a tool to make that change in the logs, that is an error. Your process must always include using the appropriate tool immediately after any such announcement. This ensures transparency and confirms that all code changes occur as described.
If you missed using the tool, correct the oversight by issuing the appropriate tool command(s) for the announced change as soon as possible.
</instructions>
<planning_instructions>
Use emoji check ticks (✅) VERY frequently to plan and track task progress.
### When to Create Planning Checklists:
- ✅ **Complex multi-step work** requiring planning and tracking
- ✅ **User provides multiple tasks** or numbered/comma-separated requests
- ✅ **After receiving new instructions** that require multiple steps
- ✅ **BEFORE starting work** on any task
- ✅ **When breaking down larger tasks** into smaller actionable steps
- ✅ **To give users visibility** into progress and planning
### When NOT to Use Planning Checklists:
- ❌ **Single, trivial tasks** that can be completed in one step
- ❌ **Purely conversational/informational requests**
- ❌ **When just reading files** or performing simple searches
### Planning Workflow:
- ✅ **Create checklist** with specific, actionable task items using emoji boxes
- ✅ **Mark tasks as in-progress** by changing ☐ to 🔄 when starting work
- ✅ **Work through tasks** systematically
- ✅ **Batch completion** - when all tasks are done, mark ALL as completed (✅) at once
- ✅ **Update checklist** to show final completed state
### Checklist Format:
- **Use emoji boxes**: ☐ (not started), 🔄 (in progress), ✅ (completed)
- **Bold task titles** for clarity
- **Detailed descriptions** with file paths and requirements
- **Logical ordering** with clear dependencies
### Example Checklist:
- ☐ **Setup project structure** - Create src/, components/, lib/ directories
- ☐ **Install dependencies** - Add React, TypeScript, Tailwind packages
- ☐ **Create main component** - Build App.tsx with basic layout
- ☐ **Add styling** - Implement responsive design with Tailwind
- ☐ **Test functionality** - Verify all features work correctly

**Note**: Use batch completion - mark / tasks as ✅ simultaneously when the entire work is finished.
</planning_instructions>

### Critical Rules - NO EXCEPTIONS
**❌ NEVER USE HTML COMMENTS IN TYPESCRIPT/JSX FILES:**
- **FORBIDDEN**: \`<!-- Any HTML-style comment -->\` - These cause syntax errors!
- **USE INSTEAD**: \`// JavaScript single-line comments\` or \`/* JavaScript multi-line comments */\`
- **JSX COMMENTS**: Use \`{/* JSX comment inside braces */}\` within JSX elements

### TSX/TypeScript Essentials

#### 1. File Structure & Extensions
- \`.tsx\` → React components with JSX only
- \`.ts\` → Utilities, types, helpers (no JSX)
- **PascalCase** for components (\`UserProfile.tsx\`)
- **camelCase** for utilities (\`formatDate.ts\`)

#### 2. TypeScript Strict Mode - Zero Tolerance
**NEVER use:** \`var\`, \`any\`, \`Function\`, \`object\`, \`@ts-ignore\`, \`console.*\` in production
**ALWAYS use:** Explicit types, specific function signatures, interface/type definitions

#### 3. Import/Export Standards
\`\`\`typescript
// ✅ CORRECT - No semicolons, single quotes, proper order
import React from 'react'
import { useState, useEffect } from 'react'
import type { User } from './types'
import { formatDate } from '@/utils'

// ❌ WRONG
import React from 'react';              // Has semicolon
import * as lodash from 'lodash';       // Imports entire library
import { useState } from "react"        // Double quotes
\`\`\`

**Import Rules:**
- **NO semicolons** after import statements
- **Single quotes** consistently
- Order: React → Third-party → Local
- \`import type\` for type-only imports
- Named imports preferred over default
- Remove all unused imports

#### 4. JSX Syntax Rules - CRITICAL
**Every tag MUST be properly closed and nested:**
\`\`\`tsx
// ✅ CORRECT
<div className="container">
  <img src="photo.jpg" alt="Photo" />
  <input type="text" value={text} />
  <span>{value}</span>
</div>

// ❌ WRONG
<div class="container">           // Wrong: class not className
  <img src="photo.jpg">            // Wrong: Not self-closed
  <input type="text">              // Wrong: Not self-closed
  <span>{value                     // Wrong: Unclosed brace and tag
</div>
\`\`\`

#### 5. Event Handlers & State
\`\`\`tsx
const handleClick = (e: React.MouseEvent<HTMLButtonElement>): void => {
  e.preventDefault()
  console.log(e.currentTarget)
}

const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
  const value = e.target.value
  setValue(value)
}

const [count, setCount] = useState<number>(0)
const [text, setText] = useState<string>('')
const [user, setUser] = useState<User | null>(null)
\`\`\`

#### 6. Conditional Rendering & Lists
\`\`\`tsx
{isLoggedIn ? <Dashboard /> : <Login />}
{isVisible && <Modal />}
{items.length > 0 && <List items={items} />}
{items.map((item) => <li key={item.id}>{item.name}</li>)}
\`\`\`

#### 7. Fragments & Props
\`\`\`tsx
<>
  <Header />
  <Main />
  <Footer />
</>

const Button = ({ label, onClick, disabled = false }: ButtonProps): JSX.Element => {
  return <button onClick={onClick} disabled={disabled}>{label}</button>
}
\`\`\`

#### 8. Syntax Validation Checklist
**Before submitting code, verify:**
- [ ] Every \`{\` has matching \`}\`
- [ ] Every \`(\` has matching \`)\`
- [ ] Every \`[\` has matching \`]\`
- [ ] Every \`<tag>\` has \`</tag>\` or is self-closed \`<tag />\`
- [ ] All string quotes match: \`"..."\`, \`'...'\`, or \`\`\`...\\\`\`\`
- [ ] No semicolons after import statements
- [ ] All JSX expressions properly closed: \`{value}\` not \`{value\`
- [ ] All attributes properly quoted: \`className="box"\`
- [ ] Proper indentation (2 spaces)
- [ ] No \`console.*\` statements
- [ ] All imports are used
- [ ] All types explicitly defined

#### 9. Code Block Standards
When writing code in markdown, use proper language identifiers:
\`\`\`typescript
// Supported: typescript, tsx, javascript, jsx, sql, css, json, bash
// Escape quotes in strings: \\\\\\' \\\\\\\\"
\`\`\`

**🎯 WHEN TO USE CODE BLOCKS:**
- SQL queries, database schemas, and migrations
- Complete function implementations
- React component examples
- Configuration file contents
- Terminal commands and scripts
- CSS styling examples
- API endpoint definitions

### Mandatory Design Requirements
Every application MUST have a **stunning, modern, extra professional design** that wows users on first look.

### Core Design Principles
- **Modern Color Schemes**: Use sophisticated gradients, shadows, and color palettes
- **Professional Typography**: Implement font hierarchies with proper weights and spacing
- **Smooth Animations**: Add hover effects, transitions, and micro-interactions
- **Perfect Spacing**: Use consistent margins, padding, and grid layouts
- **Glass Morphism/Modern Effects**: Implement backdrop blur, subtle shadows, rounded corners
- **Responsive Design**: Mobile-first approach with flawless cross-device experience

### Implementation Approach
**CRITICAL: Create UNIQUE, custom styling for each application - NO generic patterns!**

- **Use pure Tailwind CSS classes** in className attributes for most styling needs
- **Use inline styles** for dynamic values, calculations, or when Tailwind is insufficient
- **Define styles directly in components** - no external CSS files or @apply directives

### Required Elements
- **Hero Sections**: Compelling headlines with gradient text effects
- **Interactive Buttons**: 3D effects, hover animations, smooth transitions
- **Modern Cards**: Glass morphism, subtle shadows, perfect spacing
- **Loading States**: Skeleton loaders and smooth loading animations
- **Empty States**: Beautiful illustrations and helpful messaging
- **Error Handling**: Elegant error messages with recovery suggestions

### Animation & Branding
- **Page Transitions**: Smooth entry/exit animations using Framer Motion
- **Component Animations**: Stagger animations for lists and grids
- **Hover Effects**: Subtle scale, glow, and color transitions
- **Color & Branding**: Modern palettes, consistent brand colors, dark/light theme support, proper contrast ratios

### \${isNextJS ? 'NEXT.JS' :  'VERCEL   SERVERLESS'} Architecture - Critical   Rules
 \${isNextJS ? \`**Next.js File Organization:**
\`\`\`
src/
  app/           → App Router (pages and layouts)
    page.tsx     → Home page
    layout.tsx   → Root layout
    api/         → API routes (serverless functions)
      route.ts   → API endpoint handlers
  components/    → React components
  lib/          → Utilities and helpers
  hooks/        → Custom React hooks
public/         → Static assets
\`\`\`

**Next.js Specific Rules:**
- **Server Components by default** - Use 'use client' directive only when needed
- **API Routes**: Create in \\\`src/app/api/[name]/route.ts\\\` with GET, POST, PUT, DELETE exports
- **Layouts**: Use \\\`layout.tsx\\\` for shared UI across routes
- **Loading States**: Use \\\`loading.tsx\\\` for loading UI
- **Error Handling**: Use \\\`error.tsx\\\` for error boundaries
- **Environment Variables**: Prefix with \\\`NEXT_PUBLIC_\\\` for client-side access\` :

\`**File Organization:**
\`\`\`
api/             → Serverless functions (Vercel)
  constants.ts    → Server-only secrets & API keys
  *.ts            → Serverless API endpoints
src/             → Frontend React app
  env.ts          → Frontend-safe constants & config
  App.tsx         → React components
\`\`\`\`}

### Secrets Management
- **Location**: \`api/constants.ts\` (server-only)
- **Usage**: Serverless APIs only - NEVER import in frontend
- **Fallback**: \`process.env.VARIABLE_NAME || "default-value"\`
- **Rule**: Secrets stay server-side, frontend calls APIs

### Serverless API Pattern
- **Location**: \`api/*.ts\` files
- **Runtime**: \`@vercel/node\` (already included)
- **Purpose**: Handle all sensitive logic, secrets, external APIs
- **Deployment**: Auto-deployed as serverless functions on Vercel

### Frontend Constants
- **Location**: \`src/env.ts\`
- **Usage**: UI config, API URLs, public settings
- **Fallback**: \`import.meta.env.VITE_PUBLIC_*\`
- **Rule**: Safe to expose, never secrets

### AI Implementation Rules
1. **Secrets → Server-only**: \`api/constants.ts\` with \`process.env\` fallbacks
2. **APIs → Serverless**: \`api/*.ts\` handles sensitive operations
3. **Frontend → Safe config**: \`src/env.ts\` with \`VITE_PUBLIC_* \` fallbacks
3. **Architecture**: Frontend calls serverless APIs, never imports secrets
4. **Deployment**: Vercel auto-deploys \`api/*.ts\` as serverless functions

### Core Frameworks
\${isNextJS ? \`- **Next.js 14.0.4** - Full-stack React framework with App Router
- **React 18.2.0** - Modern React with hooks, concurrent features
- **React DOM 18.2.0** - React rendering for web
- **TypeScript 5.2.2** - Full type safety and modern JS features\` :

\`- **React 18.2.0** - Modern React with hooks, concurrent features
- **React DOM 18.2.0** - React rendering for web
- **React Router DOM 6.28.0** - Client-side routing
- **TypeScript 5.2.2** - Full type safety and modern JS features
- **Vite 5.0.8** - Fast build tool and dev server\`}

### UI & Styling Libraries
- **Tailwind CSS 3.3.6** - Utility-first CSS framework
- **Framer Motion 12.23.12** - Animation library for React
- **Lucide React 0.454.0** - Beautiful icon library
- **Next Themes 0.4.6** - Dark/light theme management
- **Sonner 1.7.4** - Toast notifications
- **Vaúl 0.9.9** - Drawer/modal components

### SHADCN/UI Components (ALL INSTALLED)
- **Radix UI Primitives**: Accordion, Dialog, Dropdown, Tabs, Toast, Tooltip, etc.
- **Form Components**: React Hook Form 7.60.0, Zod 3.25.67, Hookform Resolvers 3.10.0
- **UI Utilities**: Class Variance Authority, CLSX, Tailwind Merge, CMDK

### Data & Visualization
- **Recharts 2.15.4** - Chart and graph components
- **TanStack Table 8.20.5** - Advanced table/data grid
- **React Markdown 10.1.0** - Markdown rendering
- **Remark GFM 4.0.1** - GitHub Flavored Markdown support

### Date & Time
- **Date-fns 4.1.0** - Modern date utility library
- **React Day Picker 9.8.0** - Date picker component

### Critical File Safeguard - DO NOT MODIFY SENSITIVE FILES

The following files are considered sensitive and MUST NOT be modified, overwritten, or deleted by the AI:
- src/components/ui (shadcn ui components). If you need to modify any, instead create your own custom component and use it.
\${isNextJS ? \`- src/app/layout.tsx (Root layout - modify with extreme caution)
- next.config.js
- tsconfig.json
- postcss.config.js
- .eslintrc.cjs\` :
\`- main.tsx
- vite.config.ts
- tsconfig.json
- tsconfig.node.json
- postcss.config.js
- .eslintrc.cjs\`}

When building new features:
\${isNextJS ? \`- Create new pages in src/app/ directory with page.tsx files
- Always update README.md with app info and features
- Update src/app/page.tsx (home page) to reflect latest features\` :
\`- Only update index.html for app branding.
- Always update README.md with app info and features.
- Always update App.tsx to reflect the latest feature.\`}

### Package.json Rules
**When updating package.json, you MUST:**
- Format as valid, minified JSON (no trailing commas, no comments, no extra whitespace)
- Use double quotes for all keys and values
- Preserve order: name, version, description, scripts, dependencies, devDependencies, peerDependencies, etc.
- Use commas to separate packages (never omit or add extra trailing commas)
- NEVER add comments, trailing commas, or duplicate keys
- NEVER use single quotes, undefined, null, or empty keys
- NEVER add unsupported fields (e.g., "private": true is allowed, but avoid custom fields)
- ALWAYS validate JSON before writing
- Ensure version strings are valid semver (e.g., "^1.0.0")
- NEVER remove required fields (name, version, scripts, dependencies)
- NEVER break JSON structure
- ALWAYS escape special characters in strings
- NEVER add duplicate dependencies or scripts
- ALWAYS keep file valid for npm and Vite projects

**🖼️ IMAGE API:** Use https://api.a0.dev/assets/image?text={description}&aspect=1:1&seed={number} for any images needed

${projectContext ? `

## 🏗️ **PROJECT CONTEXT**
${projectContext}

---
` : ''}

${conversationHistory ? `

## 📋 **FULL CONVERSATION HISTORY**
${conversationHistory}

---
` : ''}
</instructions>

<toolUseInstructions>
### Available Tools
- **write_file**: For ALL file operations - creating new files, updating existing files, and modifying content
- **delete_file**: For removing files from the project
- **remove_package**: For removing npm packages from package.json dependencies

### Tool Restrictions
- **✅ ALLOWED**: write_file, delete_file, remove_package
- **❌ FORBIDDEN**: NEVER use read_file, list_files, search_files, grep_search, web_search, web_extract, analyze_code, check_syntax, run_tests, create_directory, delete_directory, or ANY other tools

### Tool Command Format
Use JSON tool commands embedded in markdown code blocks:

\`\`\`json
{
  "tool": "write_file",
  "path": "src/components/Component.tsx",
  "content": "import React from 'react'\\n\\nexport default function Component() {\\n  return <div>Hello</div>\\n}"                                                                                                                                        
}
\`\`\`


\`\`\`json
{
  "tool": "remove_package",
  "name": "lodash",
  "isDev": false
}
\`\`\`

**Critical Formatting Rules:**
- Wrap JSON tool commands in \\\`\\\`\\\`json code blocks
- Use double quotes for all strings
- Escape newlines as \\\\n and quotes as \\\\"
- Each tool command must be a separate JSON code block
</toolUseInstructions>

<outputFormatting>
### Markdown & Structure
- Use proper headers (##, ###) with emoji prefixes for organization
- Create clear bullet points (- ) and numbered lists (1. ) with consistent spacing
- Use **bold** for key concepts, *italics* for emphasis, \`code\` for inline references
- Use blockquotes (>) for important notes and warnings
- Add blank lines between paragraphs and sections for readability

### Emoji System
- **Status**: ✅ success, ❌ errors, ⚠️ warnings, 🔄 in-progress
- **Sections**: 🏗️ architecture, 💡 ideas, 🎨 UI/design, 🔧 implementation
- **Actions**: 📝 documentation, 🔍 research, 📦 dependencies, 🚀 deployment
🎯 target , goals  or task

### Conversation Style
- Be conversational yet professional with appropriate emojis
- Explain technical concepts clearly with examples
- Acknowledge user's previous work and build upon it
</outputFormatting>

`
}

// Enhanced Summarizer System Prompt for Codestral
const ENHANCED_SUMMARIZER_PROMPT = `# 📋 
Your task is to create a detailed summary of the conversation, preserving all technical details, decisions, and progress so work can continue seamlessly.

---

## 🕵️‍♂️ Recent Context
Focus on the **latest agent actions and tool calls**, including:
- **Commands:** Tools just executed (\`write_file\`, \`delete_file\`, \`remove_package\`)
- **Results:** Key tool outcomes (truncate long ones, keep essentials)
- **State:** What was being worked on last
- **Trigger:** Why summarization occurred (e.g., token limit reached)

---

## 🧩 Analysis Steps
1. **Chronological Review:** Trace key phases and transitions.  
2. **Intent Mapping:** Capture all user goals and expectations (with short quotes).  
3. **Technical Inventory:** List all tools, frameworks, and decisions used.  
4. **File Operations:** Extract and validate all JSON tool blocks.  
   - Parse each block; log success or failure (with reason).  
5. **Progress Summary:** Note completed vs. pending work.  
6. **Recent Commands:** List latest tool calls and outcomes.

---

## 🚨 File Operation Validation
This ensures continuity and detects failed file actions.

1. **Scan** all assistant responses for JSON blocks using \`write_file\`, \`delete_file\`, or \`remove_package\`.  
2. **Parse** valid ones; if parsing fails, record as **failed** with the file name (if known) and error reason.  
3. **Log** invalid or unparsed blocks with short error details.
---

## ✨ Required Output Structure

### 1. Conversation Overview
- List user requests (with direct quotes) and assistant actions, in chronological order.

### 2. File Operations Log
Output a JSON array. For each file, include:
- \`"path"\`: Relative file path (or \`"unknown"\` if undetermined).
- \`"operations"\`: Chronological list of operations:
    - For valid blocks:
        - \`"type"\`: \`"created"\`, \`"updated"\`, \`"deleted"\`
        - \`"content"\`: File content after operation (for \`created\`/\`updated\`)
        - \`"reason"\`: Why this operation happened (with context)
        - \`"status"\`: \`"success"\`
    - For failed blocks:
        - \`"type"\`: Attempted operation (e.g., \`"created"\`, \`"deleted"\`)
        - \`"error"\`: Error message or parsing failure reason
        - \`"raw_block"\`: The unparsed/invalid JSON block (truncated if long)
        - \`"status"\`: \`"failed"\`
- \`"final_state"\`: \`"present"\`, \`"deleted"\`, or \`"failed"\`

### 3. Full File Snapshots  
Include the **latest content** of all files with \`"final_state": "present"\` in code blocks, labeled by language and path.  

### 4. Current Focus & Commands  
- **Focus:** Describe what was being worked on last.  
- **Commands:** List recent tool actions (with file paths and results).  

### 5. Next Steps  
Summarize any **unfinished tasks or user requests** and the **next actions** needed.  

---

### 🛠️ Guidelines  
- Use exact filenames, variables, and technical terms.  
- Include only context needed to resume seamlessly.  
- Keep details accurate, clear, and logically ordered.  
- Note any failed operations or errors.  

---

**The summary must function as a clear handoff — preserving all vital progress, context, and pending work.**
`

// Generate conversation summary using Mistral Pixtral (optimized approach)
async function generateConversationSummary(
  messages: Array<{ role: string; content: string }>,
  projectId: string,
  userId: string
): Promise<any> {
  try {
    console.log('[SUMMARIZER] Using simple fullHistory approach...')

    // Use last 10 messages with full content (no truncation)
    const recentMessages = messages.slice(-10)
    const fullHistory = recentMessages
      .map((msg, idx) => `${msg.role[0].toUpperCase()}:${msg.content}`)
      .join('|')

    // Return simple summary with fullHistory
    return {
      conversationOverview: `Recent conversation: ${fullHistory}`
    }

  } catch (error) {
    console.error('[SUMMARIZER] Error generating conversation summary:', error)
    return {
      conversationOverview: 'Summary generation failed',
      activeWorkState: {
        currentFocus: 'Unable to determine current focus',
        recentCommands: []
      },
      fileOperationsLog: [],
      pendingSteps: ['Retry summary generation']
    }
  }
}

// Helper functions for parsing summary
function extractSection(text: string, sectionName: string, nextSection?: string): string {
  const regex = new RegExp(`## ${sectionName}[\\s\\S]*?\\n([\\s\\S]*?)(?=\\n##${nextSection ? `|${nextSection}` : ''}|$)`)
  const match = text.match(regex)
  return match ? match[1].trim() : ''
}

function parseFileOperationsLog(text: string): any[] {
  try {
    // Look for JSON code block containing file operations
    const jsonMatch = text.match(/```json\s*\n([\s\S]*?)\n```/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1])
    }
  } catch (error) {
    console.warn('[SUMMARIZER] Failed to parse file operations log:', error)
  }
  return []
}

function extractRecentCommands(text: string): string[] {
  const commandsSection = extractSection(text, 'Recent Commands')
  if (!commandsSection) return []
  
  // Extract bullet points or numbered items
  const lines = commandsSection.split('\n')
  return lines
    .filter(line => line.trim().match(/^[-*•]\s+|^\d+\.\s+/))
    .map(line => line.replace(/^[-*•]\s+|^\d+\.\s+/, '').trim())
    .slice(0, 5) // Keep last 5 commands
}

function extractPendingSteps(text: string): string[] {
  const pendingSection = extractSection(text, 'Pending and Next Steps')
  if (!pendingSection) return []
  
  // Extract bullet points or numbered items
  const lines = pendingSection.split('\n')
  return lines
    .filter(line => line.trim().match(/^[-*•]\s+|^\d+\.\s+/))
    .map(line => line.replace(/^[-*•]\s+|^\d+\.\s+/, '').trim())
}


export async function POST(req: Request) {
  try {
    const body = await req.json()
    // FORCE TOOLS TO BE ALWAYS ENABLED
    let { messages, projectId, useTools = true, modelId, aiMode = 'agent', generateTitle = false } = body
    
    // Ensure we always have a projectId - generate one if missing
    if (!projectId) {
      projectId = body.project?.id || 'default-project-' + Date.now()
      console.log(`[DEBUG] Generated default projectId: ${projectId}`)
    }
    
    // ALWAYS FORCE TOOLS TO BE ENABLED
    useTools = true
    
    // Validate input
    if (!messages || !Array.isArray(messages)) {
      return new Response('Invalid messages format', { status: 400 })
    }
    
    // Get user from Supabase
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return new Response('Unauthorized', { status: 401 })
    }

    // Set global user ID for tool access
    global.currentUserId = user.id

    // Handle title generation requests
    if (generateTitle) {
      try {
        const model = getMistralPixtralModel()
        const result = await generateText({
          model: model,
          messages: messages,
          temperature: 0.3
        })

        // Clean and validate the generated title
        let title = result.text?.trim() || 'New Chat Session'
        title = title.replace(/^["']|["']$/g, '').trim() // Remove quotes
        title = title.substring(0, 50) // Limit length

        return new Response(JSON.stringify({ content: title }), {
          headers: { 'Content-Type': 'application/json' }
        })
      } catch (error) {
        console.error('Error generating title:', error)
        return new Response(JSON.stringify({ content: 'New Chat Session' }), {
          headers: { 'Content-Type': 'application/json' }
        })
      }
    }

    // Get memory context to prevent duplicates and provide AI awareness
    // DISABLED: Memory functionality temporarily disabled for future use
    /*
    const currentUserMessage = messages[messages.length - 1]?.content || ''
    const memoryContext = getStreamContextForRequest(projectId, currentUserMessage)
    
    // Log memory context for debugging
    console.log('[MEMORY] Retrieved context for request:', {
      projectId,
      userMessage: currentUserMessage.substring(0, 100) + '...',
      previousActionsCount: memoryContext.previousActions.length,
      potentialDuplicatesCount: memoryContext.potentialDuplicates.length,
      relevantMemoriesCount: memoryContext.relevantMemories.length,
      suggestedApproach: memoryContext.suggestedApproach
    })
    */

    // Validate model access based on subscription plan
    const selectedModelId = modelId || DEFAULT_CHAT_MODEL
    if (selectedModelId !== DEFAULT_CHAT_MODEL) {
      try {
        // Get user's subscription plan
        const { data: userSettings } = await supabase
          .from('user_settings')
          .select('subscription_plan')
          .eq('user_id', user.id)
          .single()

        const userPlan = userSettings?.subscription_plan || 'free'

        // Import the model validation function
        const { canUseModel } = await import('@/lib/stripe-config')

        // Check if user can use the selected model
        if (!canUseModel(userPlan, selectedModelId)) {
          console.log(`[MODEL ACCESS] User ${user.id} (plan: ${userPlan}) attempted to use model ${selectedModelId} but only has access to: auto`)

          return new Response(JSON.stringify({
            error: 'Model Access Restricted',
            message: `The selected AI model is not available on your current plan. Upgrade to Pro to access all premium AI models.`,
            upgradeUrl: '/pricing',
            allowedModels: ['auto'],
            plan: userPlan
          }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
          })
        }
      } catch (error) {
        console.error('[MODEL ACCESS] Error validating model access:', error)
        // On error, fallback to auto model
        modelId = DEFAULT_CHAT_MODEL
      }
    }

    // CRITICAL: Sync client-side files to server-side InMemoryStorage
    // This ensures AI tools can access the files that exist in IndexedDB
    // Preserve AI-created files while syncing client files
    const clientFiles = body.files || []
    console.log(`[DEBUG] Syncing ${clientFiles.length} files to server-side storage for AI access`)
    
    if (clientFiles.length > 0 || true) { // Always check for AI files to preserve
    try {
      const { storageManager } = await import('@/lib/storage-manager')
      await storageManager.init()
      
      // Get existing files to preserve AI-created ones
      const existingFiles = await storageManager.getFiles(projectId)
      const aiCreatedFiles = existingFiles.filter(f => f.metadata?.createdBy === 'ai')
      
      // Clear existing files EXCEPT AI-created ones
      for (const existingFile of existingFiles) {
        if (existingFile.metadata?.createdBy !== 'ai') {
          await storageManager.deleteFile(projectId, existingFile.path)
        }
      }
      
      // Sync all client files to server storage (these are not AI-created)
      for (const file of clientFiles) {
        if (file.path && !file.isDirectory) {
          await storageManager.createFile({
            workspaceId: projectId,
            name: file.name,
            path: file.path,
            content: file.content || '',
            fileType: file.type || file.fileType || 'text',
            type: file.type || file.fileType || 'text',
            size: file.size || (file.content || '').length,
            isDirectory: false,
            metadata: { createdBy: 'client' }
          })
          console.log(`[DEBUG] Synced client file to server storage: ${file.path}`)
        }
      }
      
      // Verify sync worked
      const syncedFiles = await storageManager.getFiles(projectId)
      console.log(`[DEBUG] File sync complete: ${syncedFiles.length} files now available to AI tools (${aiCreatedFiles.length} AI-created, ${clientFiles.length} client files)`)
      
    } catch (syncError) {
      console.error('[ERROR] Failed to sync files to server storage:', syncError)
      // Continue anyway - tools may still work for write operations
    }
    }

    // CRITICAL: Sync conversation messages to server-side storage for Context Recall
    // This ensures the AI can access conversation history through the recall_context tool
    console.log(`[DEBUG] Syncing ${messages.length} conversation messages to server-side storage for Context Recall`)
    
    try {
    const { storageManager } = await import('@/lib/storage-manager')
    await storageManager.init()
    
      // Get or create conversation memory
    let conversationMemory = await storageManager.getConversationMemory(projectId, user.id)
    
    if (!conversationMemory) {
        // Create new conversation memory
      conversationMemory = {
        id: `conversation_${projectId}_${user.id}`,
        projectId,
        userId: user.id,
          messages: [],
        summary: 'New conversation session',
        keyPoints: [],
        lastActivity: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
        
        await storageManager.createConversationMemory(conversationMemory)
        console.log(`[DEBUG] Created new conversation memory for project: ${projectId}`)
      }
      
      // Sync current messages to conversation memory (only valid messages with content)
      const currentMessages = messages.slice(-20) // Keep last 20 messages
      const validCurrentMessages = currentMessages.filter(msg => 
        msg.content && msg.content.trim().length > 0
      )
      
      const existingMessageIds = new Set(conversationMemory.messages.map(m => m.content.substring(0, 50)))
      
      let newMessagesAdded = 0
      validCurrentMessages.forEach(msg => {
        const messageId = msg.content.substring(0, 50)
        if (!existingMessageIds.has(messageId)) {
          conversationMemory.messages.push({
            role: msg.role,
            content: msg.content,
            timestamp: new Date().toISOString()
          })
          existingMessageIds.add(messageId)
          newMessagesAdded++
        }
      })
      
      // Keep only last 50 messages to prevent memory bloat
      if (conversationMemory.messages.length > 50) {
        conversationMemory.messages = conversationMemory.messages.slice(-50)
      }
      
      // Update conversation memory with synced messages
      await storageManager.updateConversationMemory(
        conversationMemory.id,
        {
          messages: conversationMemory.messages,
          lastActivity: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      )
      
      console.log(`[DEBUG] Message sync complete: ${newMessagesAdded} new messages added, ${conversationMemory.messages.length} total messages in Context Recall`)
      
    } catch (messageSyncError) {
      console.error('[ERROR] Failed to sync messages to server storage:', messageSyncError)
      // Continue anyway - tools may still work
    }

    // ENHANCED: Build comprehensive project context with file contents
    let projectContext = ''
    let detectedTemplate: 'vite-react' | 'nextjs' | undefined
    try {
      const { storageManager } = await import('@/lib/storage-manager')
      await storageManager.init()
      
      // Detect template type from project files
      const files = await storageManager.getFiles(projectId)
      const hasNextConfig = files.some((f: any) => f.path === 'next.config.js' || f.path === 'next.config.mjs')
      const hasViteConfig = files.some((f: any) => f.path === 'vite.config.ts' || f.path === 'vite.config.js')
      detectedTemplate = hasNextConfig ? 'nextjs' : hasViteConfig ? 'vite-react' : undefined
      
    if (body.project) {
      const project = body.project
      projectContext = `\n\nCurrent project: ${project.name}
Project description: ${project.description || 'No description'}

${await buildOptimizedProjectContext(projectId, storageManager)}`
    } else {
      projectContext = `\n\n${detectedTemplate === 'nextjs' ? 'Current project: Next.js Project\nProject description: Next.js + React + TypeScript project with App Router' : 'Current project: Vite React Project\nProject description: Vite + React + TypeScript project with Tailwind CSS'}

${await buildOptimizedProjectContext(projectId, storageManager)}`
      }
    } catch (error) {
      console.warn('Failed to build enhanced project context:', error)
      // Fallback to basic context
      projectContext = `\n\nCurrent project: Vite React Project
Project description: Vite + React + TypeScript project

Use list_files tool with path parameter to explore project structure.
Examples: list_files({path: "/"}) for root, list_files({path: "src"}) for src folder.
Use read_file tool to read specific files when needed.`
    }

        // Get the user message for intent detection
    const userMessage = messages[messages.length - 1]?.content || ''
    
    // Get the conversation memory that was synced earlier
    const { storageManager } = await import('@/lib/storage-manager')
    await storageManager.init()
    let conversationMemory = await storageManager.getConversationMemory(projectId, user.id)
    
    // Clean up any existing empty messages that might have been stored before the fix
    if (conversationMemory && conversationMemory.messages) {
      const originalCount = conversationMemory.messages.length
      conversationMemory.messages = conversationMemory.messages.filter(msg => 
        msg.content && msg.content.trim().length > 0
      )
      
      if (originalCount !== conversationMemory.messages.length) {
        console.log(`[DEBUG] Cleaned up ${originalCount - conversationMemory.messages.length} empty messages from existing conversation memory`)
        
        // Update the cleaned memory in storage
        try {
          await storageManager.updateConversationMemory(
            conversationMemory.id,
            {
              messages: conversationMemory.messages,
              updatedAt: new Date().toISOString()
            }
          )
        } catch (cleanupError) {
          console.warn('[WARNING] Failed to update cleaned conversation memory:', cleanupError)
        }
      }
    }
    
    // CONVERSATION HISTORY: Prepare full conversation history for AI context
    let conversationSummaryContext = ''
    try {
      // Only prepare history if we have conversation memory
      if (conversationMemory && conversationMemory.messages.length > 0) {
        // Filter out messages that are just announcements without actual tool executions
        const filteredMessages = conversationMemory.messages.filter((msg: any) => {
          if (msg.role !== 'assistant') return true

          // Check if message contains actual JSON tool calls
          const hasJsonToolCall = msg.content.includes('```json') && (
            msg.content.includes('"tool": "write_file"') ||
            msg.content.includes('"tool": "delete_file"') ||
            msg.content.includes('"tool": "remove_package"')
          )

          // If it has JSON tool calls, definitely include it
          if (hasJsonToolCall) return true

          // Check for problematic announcement patterns that are NOT followed by tool calls
          const problematicAnnouncementPatterns = [
            /^Now, create the .* component/i,
            /^Now, update the .* component/i,
            /^🔄 Creating the .* component/i,
            /^🔄 Updating the .* component/i,
            /^First, create the .* component/i,
            /^First, update the .* component/i,
            /^Let's create the .* component/i,
            /^Let's update the .* component/i,
            /^Now, create the .* page/i,
            /^Now, update the .* page/i,
            /^🔄 Creating the .* page/i,
            /^🔄 Updating the .* page/i
          ]

          // For problematic announcements, add a system warning but keep the message
          const isProblematicAnnouncement = problematicAnnouncementPatterns.some(pattern => pattern.test(msg.content.trim()))

          if (isProblematicAnnouncement && !hasJsonToolCall) {
            // Add system warning to the message content
            msg.content = `⚠️ **SYSTEM WARNING: Unfulfilled Announcement** ⚠️\n\nThis message announced an action that was never executed with JSON tools. This indicates a previous AI error that should be corrected.\n\n${msg.content}\n\n---\n**ACTION REQUIRED:** The announced action should be completed using proper JSON tool calls.`
          }

          // Include all messages (both good and flagged ones)
          return true
        })

        // Create full history from filtered messages in AI-readable format
        const fullHistory = filteredMessages
          .map((msg: any, index: number) => {
            const role = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'You' : msg.role.toUpperCase()
            const message = `${role}: ${msg.content}`
            // Add separator after assistant messages to separate interaction pairs
            const separator = msg.role === 'assistant' ? '\n\n---\n\n' : '\n\n'
            return message + separator
          })
          .join('')

        conversationSummaryContext = `## 📜 CONVERSATION HISTORY\n\n${fullHistory.trim()}`
        console.log('[HISTORY] Filtered conversation history prepared for AI')
      } else {
        console.log('[HISTORY] No conversation history available')
      }
    } catch (historyError) {
      console.error('[HISTORY] Error preparing conversation history:', historyError)
      // Continue without history on error
    }
    
    // Enhanced tool request detection with autonomous planning integration
    let isToolRequest = true // Default to true for better AI performance
    let userIntent = null
    let enhancedIntentData = null
    let shouldUseAutonomousPlanning = false
    
    // TEMPORARILY DISABLED: Enhanced Intent Detection (causing JSON payload errors)
    try {
      // // Import the enhanced intent detector
      // const { EnhancedIntentDetector } = await import('@/lib/enhanced-intent-detector')
      // 
      // // Get existing files for context
      // const existingFiles = clientFiles.map((f: { path?: string }) => f.path).filter(Boolean)
      // 
      // // Use enhanced intent detection with autonomous planning capabilities
      // enhancedIntentData = await EnhancedIntentDetector.detectEnhancedIntent(
      //   userMessage,
      //   projectContext,
      //   conversationMemory ? conversationMemory.messages : [],
      //   existingFiles,
      //   body.packageJson
      // )
      
      // Skip enhanced detection and go directly to fallback
      throw new Error('Enhanced intent detection temporarily disabled due to JSON payload issues')
      
    } catch (error) {
      console.warn('Enhanced intent detection disabled/failed, using basic intent detection:', error instanceof Error ? error.message : String(error))
      
      // Fallback to original intent detection
      try {
        userIntent = await detectUserIntent(userMessage, projectContext, conversationMemory ? conversationMemory.messages : [])
        isToolRequest = userIntent.required_tools && userIntent.required_tools.length > 0
        
        console.log('[DEBUG] Fallback Intent Detection:', {
          detectedIntent: userIntent.intent,
          requiredTools: userIntent.required_tools,
          confidence: userIntent.confidence
        })
      } catch (fallbackError) {
        console.warn('All intent detection failed, using pattern matching:', fallbackError)
        // Final fallback to pattern matching
      isToolRequest = /\b(use tools?|read file|write file|create file|list files?|delete file|show file|modify file|update file|build|make|create|add|generate|implement|fix|update|change|edit|component|page|function|class|interface|type|hook|api|route|style|css|html|jsx|tsx|ts|js|json|config|package|install|setup|deploy)\b/i.test(userMessage) || userMessage.length > 10
      }
    }
    
    // FORCE TOOL REQUEST TO TRUE for most cases
    const forceToolRequest = true
    
    // Get the selected model information for context
    const selectedModel = getModelById(modelId || DEFAULT_CHAT_MODEL)
    const modelContextInfo = selectedModel ? 
      `\n\n🤖 **Current AI Model**: ${selectedModel.name} (${selectedModel.provider})\n${selectedModel.description}` : 
      ''
    
    // Enhanced AI mode context with optimized codebase discussion capabilities
    const modeContextInfo = aiMode === 'ask' ? 
      `\n\n🔍 **CURRENT MODE: ASK MODE (CODEBASE DISCUSSION & ANALYSIS)**

**🎯 DISCUSSION FOCUS:**
• Engage in natural, insightful conversations about the codebase
• Provide expert analysis and recommendations
• Answer questions about architecture, patterns, and implementation
• Offer suggestions for improvements and optimizations
• Help users understand complex code structures

**📚 CODEBASE CONTEXT ACCESS:**
• Full access to optimized project structure and file contents
• Detailed information about components, functions, and dependencies
• Context-aware responses based on the entire codebase
• Historical conversation context for continuity

**💡 ANALYSIS CAPABILITIES:**
• Explain complex code patterns and architectural decisions
• Identify potential improvements and best practices
• Help with debugging and troubleshooting
• Provide guidance on modern development techniques

**🚫 RESTRICTIONS:**
• No file modifications, creations, or deletions
• Focus on analysis, discussion, and recommendations only` :

      `\n\n🤖 **CURRENT MODE: AGENT MODE (FULL ACCESS)**\n- You have complete file system access\n- You can create, modify, and delete files\n- You can build complete applications\n- Use all available tools as needed`

    // Add autonomous planning context if applicable (disabled for now)
    const autonomousPlanningContext = '' // shouldUseAutonomousPlanning && enhancedIntentData?.autonomous_instructions ? 
      // `\n\n${enhancedIntentData.autonomous_instructions}` : ''

  

    // TALENT SHOWCASE FORMATTING: Focus on demonstrating actual technical achievements
    const formatResponseProfessionally = (response: string): string => {
      // Highlight technical implementations
      if (response.includes('TypeScript') || response.includes('hooks') || response.includes('animations')) {
        response = response.replace(
          /(implemented|built|created)/gi,
          (match) => `🔧 **Technical Implementation:** ${match}`
        )
      }

      // Showcase advanced patterns
      if (response.includes('custom hooks') || response.includes('generics') || response.includes('context')) {
        response = response.replace(
          /(using|with)/gi,
          (match) => `🎯 **Advanced Pattern:** ${match}`
        )
      }

      // Highlight performance optimizations
      if (response.includes('lazy') || response.includes('optimized') || response.includes('loading')) {
        response = response.replace(
          /(includes|features|implements)/gi,
          (match) => `⚡ **Performance Feature:** ${match}`
        )
      }

      // Showcase interactive features
      if (response.includes('hover') || response.includes('animation') || response.includes('transition')) {
        response = response.replace(
          /(smooth|interactive|engaging)/gi,
          (match) => `✨ **Interactive Experience:** ${match}`
        )
      }

      return response
    }

    // METADATA-ONLY CONVERSATION SYSTEM: Generate compact tool summaries
    const createToolMetadata = (toolResult: any): any => {
      // Defensive check to prevent processing of malformed tool results
      if (!toolResult || typeof toolResult !== 'object') {
        console.warn('[METADATA] Skipping malformed tool result:', toolResult)
        return null
      }

      const baseMetadata = {
        toolName: toolResult.toolName || 'unknown_tool',
        timestamp: Date.now(),
        success: toolResult.result?.success !== false,
        executionTime: toolResult.executionTime || 0
      }

      switch (toolResult.toolName) {
        case 'read_file':
          return {
            ...baseMetadata,
            filePath: toolResult.args?.path,
            linesCount: toolResult.result?.content ? toolResult.result.content.split('\n').length : 0,
            fileSize: toolResult.result?.content?.length || 0
          }

        case 'write_file':
          return {
            ...baseMetadata,
            filePath: toolResult.args?.path,
            linesCount: toolResult.result?.content ? toolResult.result.content.split('\n').length : 0,
            action: 'created',
            fileType: toolResult.args?.path ? toolResult.args.path.split('.').pop() || 'unknown' : 'unknown',
            // Extract key information from content for context
            hasImports: toolResult.result?.content?.includes('import ') || false,
            hasExports: toolResult.result?.content?.includes('export ') || false,
            hasComponents: toolResult.result?.content?.includes('const ') || toolResult.result?.content?.includes('function ') || false
          }

        case 'edit_file':
          const editResult = toolResult.result
          return {
            ...baseMetadata,
            filePath: toolResult.args?.path,
            changesCount: editResult?.appliedEdits?.length || 0,
            action: 'modified',
            fileType: toolResult.args?.path ? toolResult.args.path.split('.').pop() || 'unknown' : 'unknown',
            // Track what was actually changed
            edits: editResult?.appliedEdits?.map((edit: any) => ({
              type: edit.search.includes('import ') ? 'import' :
                   edit.search.includes('export ') ? 'export' :
                   edit.search.includes('const ') || edit.search.includes('function ') ? 'component' :
                   'content',
              description: edit.search.length > 50 ? edit.search.substring(0, 50) + '...' : edit.search
            })) || [],
            // Check if imports were added
            importsAdded: editResult?.appliedEdits?.some((edit: any) =>
              edit.replace.includes('import ') && !edit.search.includes('import ')
            ) || false,
            // Check if components were added
            componentsModified: editResult?.appliedEdits?.some((edit: any) =>
              edit.replace.includes('const ') || edit.replace.includes('function ')
            ) || false,
            // Include fallback suggestion if operation failed
            fallbackSuggestion: !editResult?.success ? editResult?.fallbackSuggestion : undefined
          }

        case 'list_files':
          return {
            ...baseMetadata,
            directory: toolResult.args?.path || '/',
            fileCount: toolResult.result?.files?.length || 0
          }

        case 'analyze_dependencies':
          return {
            ...baseMetadata,
            filePath: toolResult.args?.filePath,
            dependenciesFound: toolResult.result?.imports?.length || 0,
            missingDeps: toolResult.result?.missingDependencies?.length || 0
          }

        case 'web_search':
          return {
            ...baseMetadata,
            query: toolResult.args?.query,
            resultsCount: toolResult.result?.rawData?.results?.length || 0
          }

        default:
          return baseMetadata
      }
    }

    // Generate implementation-focused conversation message from tool metadata
    const createCompactConversationMessage = (toolMetadata: any[]): string => {
      // Filter out any null or malformed metadata
      const validMetadata = toolMetadata.filter(meta => meta && typeof meta === 'object' && meta.toolName)

      const summaries = validMetadata.map(meta => {
        switch (meta.toolName) {
          case 'read_file':
            return `📖 **Code Analysis**: ${meta.filePath ? meta.filePath.split('/').pop() : 'unknown file'} (${meta.linesCount} lines, ${meta.fileSize} bytes)`
          case 'write_file':
            const writeDetails = []
            if (meta.hasImports) writeDetails.push('ES6 imports')
            if (meta.hasExports) writeDetails.push('module exports')
            if (meta.hasComponents) writeDetails.push('React components with hooks')
            const writeInfo = writeDetails.length > 0 ? ` with ${writeDetails.join(', ')}` : ''
            return `✨ **New Implementation**: ${meta.filePath ? meta.filePath.split('/').pop() : 'unknown file'} (${meta.linesCount} lines${writeInfo})`
          case 'edit_file':
            const editDetails = []
            if (meta.importsAdded) editDetails.push('new dependencies added')
            if (meta.componentsModified) editDetails.push('component logic enhanced')
            const editInfo = editDetails.length > 0 ? ` - ${editDetails.join(', ')}` : ''
            const editSummary = meta.edits?.length > 0 ?
              meta.edits.slice(0, 2).map((edit: any) => edit.type).join(', ') : ''
            const fallbackNote = meta.fallbackSuggestion ? ' | 💡 Used alternative implementation' : ''
            return `🔧 **Code Enhancement**: ${meta.filePath ? meta.filePath.split('/').pop() : 'unknown file'} (${meta.changesCount} modifications${editInfo}${editSummary ? ` - ${editSummary}` : ''})${fallbackNote}`
          case 'list_files':
            return `📁 **Project Structure**: ${meta.directory} (${meta.fileCount} files discovered)`
          case 'analyze_dependencies':
            return `🔍 **Dependency Analysis**: ${meta.filePath ? meta.filePath.split('/').pop() : 'unknown file'} (${meta.dependenciesFound} packages, ${meta.missingDeps} potential optimizations)`
          case 'web_search':
            return `🔎 **Research Complete**: "${meta.query}" (${meta.resultsCount} relevant findings)`
          default:
            return `⚙️ **${meta.toolName.replace('_', ' ').toUpperCase()}**: ${meta.success ? '✅ Execution successful' : '❌ Execution failed'}`
        }
      })

      return summaries.join(' • ')
    }

    // REAL-TIME UI UPDATE FUNCTIONS
    const applyToolResultToUI = async (toolResult: any) => {
      // Apply tool results to UI immediately with full details
      console.log('[UI UPDATE] Applying tool result to UI:', {
        toolName: toolResult.toolName,
        hasResult: !!toolResult.result,
        resultKeys: toolResult.result ? Object.keys(toolResult.result) : []
      })

      // Create enhanced UI update with operation context
      let uiUpdate = {
        toolName: toolResult.toolName,
        success: toolResult.result?.success !== false,
        timestamp: Date.now(),
        details: {}
      }

      // Add operation-specific context
      if (toolResult.result) {
        switch (toolResult.toolName) {
          case 'write_file':
            uiUpdate.details = {
              filePath: toolResult.args?.path,
              action: 'created',
              linesCount: toolResult.result?.content ? toolResult.result.content.split('\n').length : 0,
              fileType: toolResult.args?.path ? toolResult.args.path.split('.').pop() || 'unknown' : 'unknown',
              hasImports: toolResult.result?.content?.includes('import ') || false,
              hasComponents: toolResult.result?.content?.includes('const ') || toolResult.result?.content?.includes('function ') || false
            }
            break

          case 'edit_file':
            const edits = toolResult.result.appliedEdits || []
            uiUpdate.details = {
              filePath: toolResult.args?.path,
              action: 'modified',
              changesCount: edits.length,
              importsAdded: edits.some((edit: any) => edit.replace.includes('import ') && !edit.search.includes('import ')),
              componentsModified: edits.some((edit: any) => edit.replace.includes('const ') || edit.replace.includes('function ')),
              editTypes: edits.map((edit: any) => ({
                type: edit.search.includes('import ') ? 'import' :
                     edit.search.includes('export ') ? 'export' :
                     edit.search.includes('const ') || edit.search.includes('function ') ? 'component' : 'content'
              }))
            }
            break

          case 'read_file':
            uiUpdate.details = {
              filePath: toolResult.args?.path,
              action: 'read',
              linesCount: toolResult.result?.content ? toolResult.result.content.split('\n').length : 0,
              fileSize: toolResult.result?.content?.length || 0
            }
            break

          default:
            uiUpdate.details = toolResult.result
        }

      }

      // Store enhanced UI update for frontend consumption
      realtimeUpdates.push({
        type: 'tool_executed',
        ...uiUpdate
      })
    }

    const emitRealtimeUpdate = (update: any) => {
      // Emit real-time event for frontend consumption
      console.log('[REALTIME] Emitting update:', update.type)

      // In a real implementation, this would use WebSockets or Server-Sent Events
      // For now, we'll store it for the response
      realtimeUpdates.push(update)
    }

    const addToConversationMemory = async (message: any) => {
      // Add compact message to conversation memory (metadata only)
      try {
        const { storageManager } = await import('@/lib/storage-manager')
        await storageManager.init()

        if (conversationMemory) {
          await storageManager.updateConversationMemory(
            conversationMemory.id,
            {
              messages: [
                ...conversationMemory.messages,
                {
                  role: message.role,
                  content: message.content,
                  timestamp: message.timestamp
                }
              ],
              lastActivity: new Date().toISOString()
            }
          )

          console.log('[MEMORY] Added compact message to conversation')
        }
      } catch (error) {
        console.warn('[MEMORY] Failed to add to conversation memory:', error)
      }
    }


    // Initialize real-time updates array
    const realtimeUpdates: any[] = []

    // ENHANCED TOKEN BUDGETING: Intelligent token management with dynamic allocation
    const tokenBudget = {
      maxTotal: 2000,
      system: { min: 300, max: 600 },
      project: { min: 200, max: 1200 },
      conversation: { min: 0, max: 400 },
      safetyBuffer: 100
    }

    // More accurate token estimation (closer to actual token counts)
    const estimateTokens = (text: string) => Math.ceil(text.length / 3.5)

    // Calculate initial token usage
    let systemTokens = estimateTokens(getStreamingSystemPrompt())
    let projectTokens = estimateTokens(projectContext)
    let conversationTokens = 0

    // Include conversation history tokens if available
    if (conversationMemory?.messages) {
      const recentMessages = conversationMemory.messages.slice(-10)
      const conversationText = recentMessages.map((msg: any) => `${msg.role}: ${msg.content}`).join('\n')
      conversationTokens = estimateTokens(conversationText)
    }

    const totalTokens = systemTokens + projectTokens + conversationTokens

    console.log(`[TOKEN BUDGET] System: ${systemTokens}, Project: ${projectTokens}, Conversation: ${conversationTokens}, Total: ${totalTokens}`)

    // Dynamic token allocation based on task complexity and available budget
    let availableBudget = tokenBudget.maxTotal - tokenBudget.safetyBuffer

    if (totalTokens > availableBudget) {
      console.warn(`[TOKEN OVERFLOW] ${totalTokens} tokens exceeds ${availableBudget} budget - implementing smart trimming`)

      // Strategy 1: Adjust allocation based on task complexity
      const complexity = userIntent?.complexity || 'medium'
      let systemAllocation, projectAllocation, conversationAllocation

      switch (complexity) {
        case 'simple':
          systemAllocation = Math.min(tokenBudget.system.max, Math.floor(availableBudget * 0.4))
          projectAllocation = Math.min(tokenBudget.project.max, Math.floor(availableBudget * 0.4))
          conversationAllocation = Math.min(tokenBudget.conversation.max, Math.floor(availableBudget * 0.2))
          break
        case 'complex':
          systemAllocation = Math.min(tokenBudget.system.max, Math.floor(availableBudget * 0.3))
          projectAllocation = Math.min(tokenBudget.project.max, Math.floor(availableBudget * 0.5))
          conversationAllocation = Math.min(tokenBudget.conversation.max, Math.floor(availableBudget * 0.2))
          break
        default: // medium
          systemAllocation = Math.min(tokenBudget.system.max, Math.floor(availableBudget * 0.35))
          projectAllocation = Math.min(tokenBudget.project.max, Math.floor(availableBudget * 0.45))
          conversationAllocation = Math.min(tokenBudget.conversation.max, Math.floor(availableBudget * 0.2))
      }

      // Strategy 2: Smart truncation with priority preservation
      const totalAllocation = systemAllocation + projectAllocation + conversationAllocation

      // Truncate conversation history first (least critical)
      if (conversationTokens > conversationAllocation) {
        console.log(`[TOKEN TRIM] Reducing conversation from ${conversationTokens} to ${conversationAllocation} tokens`)
        conversationTokens = conversationAllocation
      }

      // Truncate project context if still over budget
      const currentTotal = systemTokens + projectTokens + conversationTokens
      if (currentTotal > availableBudget) {
        const excessTokens = currentTotal - availableBudget
        const newProjectTokens = Math.max(tokenBudget.project.min, projectTokens - excessTokens)

        if (newProjectTokens < projectTokens) {
          const truncateChars = (projectTokens - newProjectTokens) * 3.5
          projectContext = projectContext.substring(0, Math.floor(projectContext.length - truncateChars))
          projectTokens = estimateTokens(projectContext)
          console.log(`[TOKEN TRIM] Truncated project context from ${projectTokens + excessTokens} to ${projectTokens} tokens`)
        }
      }

      // Strategy 3: Emergency truncation if still over budget
      const finalTotal = systemTokens + projectTokens + conversationTokens
      if (finalTotal > availableBudget) {
        const emergencyCut = finalTotal - availableBudget + 50 // Extra buffer
        if (projectContext.length > emergencyCut * 3.5) {
          projectContext = projectContext.substring(0, Math.floor(projectContext.length - emergencyCut * 3.5))
          projectTokens = estimateTokens(projectContext)
          console.warn(`[TOKEN EMERGENCY] Emergency truncation applied, final tokens: ${systemTokens + projectTokens + conversationTokens}`)
        }
      }

      const finalTotalTokens = systemTokens + projectTokens + conversationTokens
      console.log(`[TOKEN BUDGET] Final allocation - System: ${systemTokens}, Project: ${projectTokens}, Conversation: ${conversationTokens}, Total: ${finalTotalTokens}`)
    }

    // DYNAMIC CONTEXT LOADING: Load additional context based on task complexity
    let additionalContext = ''
    if (userIntent?.complexity === 'complex' && totalTokens < 1500) {
      // For complex tasks, load more detailed context (only if under budget)
      try {
        const files = await storageManager.getFiles(projectId)
        const componentFiles = files.filter((f: any) => f.path.includes('/components/')).slice(0, 3)
        additionalContext = `\n🔧 COMPONENTS: ${componentFiles.map(f => f.path ? f.path.split('/').pop() : 'unknown').join(', ')}`
      } catch (e) {
        console.log('[CONTEXT] Failed to load additional context for complex task')
      }
    }

    // Get the AI model based on the selected modelId





    // Get the AI model based on the selected modelId
    const selectedAIModel = getAIModel(modelId)
    
    // Create AI client
    const model = selectedAIModel
    
    // ALWAYS ENABLE TOOLS - Tools are forced to be enabled on every request
    if (true) { // useTools && projectId - now always true
      // Log tool configuration for debugging
      console.log('[DEBUG] Chat API - Tools FORCE-ENABLED:', {
        projectId,
        modelId: modelId || DEFAULT_CHAT_MODEL,
        modelName: selectedModel?.name || 'Unknown',
        useTools: true,
        originalMessagesCount: messages.length,
        messagesToSendCount: messages.length > 10 ? 10 : messages.length
      })
      
      // Use tools-enabled generation with multi-step support
      const abortController = new AbortController()
      
      // Filter and validate conversation memory messages, ensuring proper typing
      const validMemoryMessages = conversationMemory ? 
        conversationMemory.messages
          .filter(msg => msg.content && msg.content.trim().length > 0)
          .map(msg => ({
            role: msg.role as 'user' | 'assistant' | 'system',
            content: msg.content
          })) : []
      
      // Get the latest user message (no need to merge with project context since it's already in system prompt)
      const currentUserMessage = messages[messages.length - 1]
      const mergedUserMessage = {
        role: 'user' as const,
        content: currentUserMessage?.content || ''
      }
      
      // Always use the comprehensive system prompt (includes project context and full conversation history)
      const streamingPrompt = getStreamingSystemPrompt(projectContext, undefined, detectedTemplate, conversationSummaryContext)

      const finalMessages: Array<{role: 'system' | 'user' | 'assistant', content: string}> = [
        {
          role: 'system' as const,
          content: streamingPrompt
        },
        // Add the merged user message
        mergedUserMessage
      ]

      console.log('[SUMMARY] Using comprehensive system prompt with project context and full conversation history')
      
      console.log('[DEBUG] Message validation:', {
        totalMemoryMessages: conversationMemory?.messages?.length || 0,
        validMemoryMessages: validMemoryMessages.length,
        invalidMessages: (conversationMemory?.messages?.length || 0) - validMemoryMessages.length,
        currentUserMessageLength: currentUserMessage?.content?.length || 0,
        projectContextLength: projectContext?.length || 0,
        mergedMessageLength: mergedUserMessage.content.length,
        finalMessagesCount: finalMessages.length,
        sampleValidMessage: validMemoryMessages[0] ? {
          role: validMemoryMessages[0].role,
          contentLength: validMemoryMessages[0].content?.length || 0,
          contentPreview: validMemoryMessages[0].content?.substring(0, 50) + '...'
        } : null
      })
      
      // FORCE TOOL USAGE: The AI MUST use these tools when users mention files
      // Only include web tools if explicitly needed based on intent detection
      console.log('[DEBUG] Creating tool set with intent data:', {
        intent: userIntent?.intent || 'unknown',
        requiredTools: userIntent?.required_tools || [],
        confidence: userIntent?.confidence || 0,
        needsWebTools: userIntent?.required_tools?.includes('web_search') || userIntent?.required_tools?.includes('web_extract')
      })

      // Create tools object
      let tools: Record<string, any> = createFileOperationTools(projectId, aiMode, conversationMemory ? conversationMemory.messages : [], user.id, userIntent, userMessage)

      // ENHANCED WEB TOOL DETECTION: Add web tools for explicit web requests
      const explicitWebRequest = /\b(search|news|latest|current|web|internet|online|google|find online|look up|research)\b/i.test(userMessage || '')
      const needsWebTools = userIntent?.required_tools?.includes('web_search') || 
                           userIntent?.required_tools?.includes('web_extract') || 
                           explicitWebRequest

      if (needsWebTools && !tools.web_search) {
        console.log('[DEBUG] Adding web tools due to explicit web request detected:', { userMessage, explicitWebRequest })
        // Manually add web tools if not already included
        const { z } = await import('zod')
        const { tool } = await import('ai')
        
        tools.web_search = tool({
          description: 'Search the web for current information, news, and trends',
          inputSchema: z.object({
            query: z.string().describe('Search query to find relevant web content')
          }),
          execute: async ({ query }, { abortSignal, toolCallId }) => {
            if (abortSignal?.aborted) {
              throw new Error('Operation cancelled')
            }
            
            try {
              // Use the existing searchWeb function defined in this file
              const searchResults = await searchWeb(query)
              
              return {
                success: true,
                message: `✅ Web search completed for: "${query}"`,
                results: searchResults.cleanedResults,
                query,
                toolCallId
              }
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error'
              console.error('[ERROR] web_search failed:', error)
              
              return { 
                success: false, 
                error: `Web search failed: ${errorMessage}`,
                query,
                toolCallId
              }
            }
          }
        })
      }

      // Get model information first
      const modelInfo = modelId ? getModelById(modelId) : null
      const modelProvider = modelInfo?.provider

      // COHERE COMPATIBILITY: Filter out complex tools that cause API errors
      // Cohere has stricter tool validation and doesn't support complex nested schemas
      if (modelProvider === 'cohere') {
        const cohereCompatibleTools: Record<string, any> = {}

        // Only include basic file operations for Cohere - exclude edit_file due to complex schema
        const allowedTools = ['read_file', 'write_file', 'list_files', 'delete_file', 'analyze_dependencies']

        for (const [toolName, toolDef] of Object.entries(tools)) {
          if (allowedTools.includes(toolName)) {
            cohereCompatibleTools[toolName] = toolDef
          }
        }

        console.log('[COHERE COMPATIBILITY] Filtered tools for Cohere:', {
          originalCount: Object.keys(tools).length,
          filteredCount: Object.keys(cohereCompatibleTools).length,
          allowedTools,
          removedTools: Object.keys(tools).filter(name => !allowedTools.includes(name))
        })

        tools = cohereCompatibleTools
      }

      // CRITICAL SAFEGUARD: Ensure list_files is ALWAYS available
      // This is a final check to guarantee list_files is in the tool set regardless of any filtering
      if (!tools.list_files) {
        console.warn('[SAFEGUARD] list_files tool missing from final set - adding it back')
        const { z } = await import('zod')
        const { tool } = await import('ai')
        
        tools.list_files = tool({
          description: 'List files and directories in a specific folder path',
          inputSchema: z.object({
            path: z.string().describe('Directory path to list (use "/" for root)')
          }),
          execute: async ({ path }, { abortSignal, toolCallId }) => {
            if (abortSignal?.aborted) {
              throw new Error('Operation cancelled')
            }
            
            try {
              const { storageManager } = await import('@/lib/storage-manager')
              await storageManager.init()
              
              // Validate path
              if (!path || typeof path !== 'string') {
                return { 
                  success: false, 
                  error: `Invalid directory path provided`,
                  path,
                  toolCallId
                }
              }
              
              // Get all files from the project
              const allFiles = await storageManager.getFiles(projectId)
              
              // Filter files based on the requested path
              let filteredFiles;
              if (path === '/' || path === '') {
                // Root directory - show all files at root level
                filteredFiles = allFiles.filter(f => {
                  const pathParts = f.path.split('/').filter(p => p.length > 0)
                  return pathParts.length === 1 // Only top-level files
                })
              } else {
                // Specific directory - show files in that directory
                const normalizedPath = path.startsWith('/') ? path.slice(1) : path
                const searchPath = normalizedPath.endsWith('/') ? normalizedPath : normalizedPath + '/'
                
                filteredFiles = allFiles.filter(f => {
                  return f.path.startsWith(searchPath) && 
                         f.path.slice(searchPath.length).indexOf('/') === -1 // Only direct children
                })
              }

              return { 
                success: true, 
                message: `✅ Listed ${filteredFiles.length} items in directory: ${path}`,
                path,
                files: filteredFiles.map(f => ({
                  name: f.name,
                  path: f.path,
                  type: f.type,
                  size: f.size,
                  isDirectory: f.isDirectory,
                  createdAt: f.createdAt
                })),
                count: filteredFiles.length,
                action: 'list',
                toolCallId
              }
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error'
              console.error(`[ERROR] list_files failed for ${path}:`, error)
              
              return { 
                success: false, 
                error: `Failed to list directory ${path}: ${errorMessage}`,
                path,
                toolCallId
              }
            }
          }
        })
      }

      // Log final tool configuration after Cohere filtering and safeguards
      console.log('[DEBUG] Final Tool Set:', {
        totalTools: Object.keys(tools).length,
        toolNames: Object.keys(tools),
        hasWebSearch: tools.web_search !== undefined,
        hasWebExtract: tools.web_extract !== undefined,
        hasReadFile: tools.read_file !== undefined,
        hasWriteFile: tools.write_file !== undefined,
        hasEditFile: tools.edit_file !== undefined,
        hasListFiles: tools.list_files !== undefined,
        hasDeleteFile: tools.delete_file !== undefined,
        hasTaskTools: false, // Filtered out for Cohere
        taskToolsCount: 0, // Filtered out for Cohere
        cohereFiltered: modelProvider === 'cohere',
        listFilesGuaranteed: tools.list_files !== undefined, // CRITICAL: This should ALWAYS be true
        webToolsIncluded: needsWebTools,
        explicitWebRequest: explicitWebRequest
      })

      // FINAL VERIFICATION: Ensure list_files is absolutely present
      if (!tools.list_files) {
        console.error('[CRITICAL ERROR] list_files tool is missing despite safeguards!')
        throw new Error('list_files tool is required but missing from final tool set')
      } else {
        console.log('[VERIFICATION] ✅ list_files tool is confirmed present in final tool set')
      }

      try {
        // INTELLIGENT READ-WRITE SEPARATION: Use generateText for read-only tools, streamText for write operations
        
        // Step 1: Create read-only tools for preprocessing phase
        const readOnlyTools = {
          read_file: tools.read_file,
          web_search: tools.web_search,
          web_extract: tools.web_extract
        }
        
        // Filter out undefined tools
        const filteredReadOnlyTools = Object.fromEntries(
          Object.entries(readOnlyTools).filter(([_, tool]) => tool !== undefined)
        )
        
        console.log('[PREPROCESSING] Read-only tools available:', Object.keys(filteredReadOnlyTools))
        
        // Step 2: Check if request needs read-only tools (intelligent detection)
        const needsReading = /\b(read|list|show|display|get|find|search|analyze|extract|what|how|where|which)\b/i.test(userMessage || '') ||
                            /\b(files?|content|structure|dependencies|code|implementation)\b/i.test(userMessage || '')
        
        let preprocessingResults: any = null
        
        if (needsReading && Object.keys(filteredReadOnlyTools).length > 0) {
          console.log('[PREPROCESSING] Executing read-only tools with generateText')
          
          // Execute read-only tools first with focused system prompt
          const preprocessingPrompt = getPreprocessingSystemPrompt()

          const preprocessingMessages = [
            { role: 'system' as const, content: preprocessingPrompt },
            { role: 'user' as const, content: userMessage }
          ]
          
          preprocessingResults = await generateText({
            model: model,
            messages: preprocessingMessages,
            temperature: 0.1,
            abortSignal: abortController.signal,
            tools: filteredReadOnlyTools,
            toolChoice: 'auto'
          })
          
          console.log('[PREPROCESSING] Read-only tool execution result:', {
            hasToolCalls: !!preprocessingResults.toolCalls?.length,
            toolCallsCount: preprocessingResults.toolCalls?.length || 0,
            textLength: preprocessingResults.text?.length || 0
          })
        }

        const hasToolCalls = preprocessingResults?.toolCalls && preprocessingResults.toolCalls.length > 0
        const hasSignificantText = preprocessingResults?.text && preprocessingResults.text.trim().length > 50
        
        console.log('[PREPROCESSING] Read-only tool execution result:', {
          hasToolCalls,
          toolCallsCount: preprocessingResults?.toolCalls?.length || 0,
          hasSignificantText,
          textLength: preprocessingResults?.text?.length || 0,
          finishReason: preprocessingResults?.finishReason,
          toolCallsRaw: JSON.stringify(preprocessingResults?.toolCalls, null, 2),
          toolResultsRaw: JSON.stringify(preprocessingResults?.toolResults, null, 2)
        })

        // Step 3: Now use streamText with JSON command system for all responses
        console.log('[STREAMING] Starting JSON-enhanced streaming response')
        
        // Create enhanced messages with preprocessing context
        let enhancedMessages: any = [...finalMessages]
        
        if (hasToolCalls && preprocessingResults) {
          // Add preprocessing context to the conversation
          const preprocessingContext = `## Preprocessing Results

${preprocessingResults.text || 'Information gathered successfully.'}

## Available Information
${preprocessingResults.toolResults?.map((result: any, index: number) => {
  const toolCall = preprocessingResults.toolCalls?.[index]
  return `- ${toolCall?.toolName}: ${JSON.stringify(result, null, 2)}`
}).join('\n') || 'No additional context available.'}

---
  ## JSON Formatting Instructions
      When using JSON tool commands, always ensure the output is valid, parsable JSON:
      - Use double quotes for all strings and keys
      - Do not include trailing commas after the last property
      - Ensure proper JSON structure with matching braces and brackets
      - Escape special characters in strings (e.g., use \\" for quotes inside strings)
      - Do not include comments or extra text outside the JSON object
      - Validate the JSON before outputting to ensure it can be parsed

      Now respond to the user's request. If you need to create, edit, or delete files, use JSON tool commands in code blocks:

      \`\`\`json
      {
        "tool": "write_file",
        "path": "file/path.ext", 
        "content": "file content here"
      }
      \`\`\`



      \`\`\`json
      {
        "tool": "delete_file",
        "path": "file/path.ext"
      }
      \`\`\`

Provide a comprehensive response addressing: "${currentUserMessage?.content || ''}"`
          
          enhancedMessages.push({
            role: 'user' as const,
            content: preprocessingContext
          })
        } else {
          // Add JSON command instructions for cases without preprocessing using focused prompt
          // DISABLED: Memory functionality temporarily disabled for future use
          // const streamingPrompt = getStreamingSystemPrompt(projectContext, memoryContext)
          const streamingPrompt = getStreamingSystemPrompt(projectContext, undefined, detectedTemplate, conversationSummaryContext)
          
          enhancedMessages.push({
            role: 'system' as const,
            content: streamingPrompt
          })
        }

        // Helper function to detect content type for better frontend handling
        const detectContentType = (chunk: string): string => {
          const trimmed = chunk.trim()
          if (/^#{1,6}\s/.test(trimmed)) return 'header'
          if (/^[\s]*[-*+]\s/.test(trimmed)) return 'list-item'
          if (/^\d+\.\s/.test(trimmed)) return 'numbered-list-item'
          if (/^>\s/.test(trimmed)) return 'blockquote'
          
          // Enhanced code block detection with language identification
          if (/^```/.test(trimmed)) {
            const languageMatch = trimmed.match(/^```(\w+)/)
            if (languageMatch) {
              const language = languageMatch[1].toLowerCase()
              switch (language) {
                case 'sql': return 'code-block-sql'
                case 'typescript': case 'ts': return 'code-block-typescript'
                case 'javascript': case 'js': return 'code-block-javascript'
                case 'jsx': return 'code-block-jsx'
                case 'tsx': return 'code-block-tsx'
                case 'css': return 'code-block-css'
                case 'bash': case 'sh': return 'code-block-bash'
                case 'json': return 'code-block-json'
                case 'yaml': case 'yml': return 'code-block-yaml'
                case 'html': return 'code-block-html'
                case 'python': case 'py': return 'code-block-python'
                default: return 'code-block-generic'
              }
            }
            return 'code-block'
          }
          
          if (/\*\*.*\*\*/.test(trimmed)) return 'bold-text'
          if (/\*.*\*/.test(trimmed)) return 'italic-text'
          if (trimmed.includes('\n\n')) return 'paragraph-break'
          if (trimmed.includes('\n')) return 'line-break'
          return 'text'
        }

        // Server-side stream buffer for whitespace preservation and performance
        interface ServerStreamBuffer {
          content: string
          inCodeBlock: boolean
          lastEmittedContent: string
        }

        const createServerStreamBuffer = (): ServerStreamBuffer => ({
          content: '',
          inCodeBlock: false,
          lastEmittedContent: ''
        })

        // Process streaming delta on server side to reduce client load
        const processServerStreamingDelta = (buffer: ServerStreamBuffer, newDelta: string): string => {
          // Add new delta to buffer
          buffer.content += newDelta
          
          // Check if we're entering or exiting a code block
          const codeBlockMarkers = buffer.content.match(/```/g) || []
          const wasInCodeBlock = buffer.inCodeBlock
          buffer.inCodeBlock = codeBlockMarkers.length % 2 !== 0
          
          // If we're in a code block, buffer it
          if (buffer.inCodeBlock) {
            // Find the start of the current code block
            const lastCodeBlockStart = buffer.content.lastIndexOf('```')
            
            // Extract everything up to the code block
            const beforeCodeBlock = buffer.content.substring(0, lastCodeBlockStart)
            
            // If there's content before the code block that hasn't been emitted, emit it
            if (beforeCodeBlock.length > buffer.lastEmittedContent.length) {
              const toEmit = beforeCodeBlock.substring(buffer.lastEmittedContent.length)
              buffer.lastEmittedContent = beforeCodeBlock
              return toEmit
            }
            
            // Don't emit partial code blocks
            return ''
          }
          
          // If we just exited a code block, emit the complete code block
          if (wasInCodeBlock && !buffer.inCodeBlock) {
            const toEmit = buffer.content.substring(buffer.lastEmittedContent.length)
            buffer.lastEmittedContent = buffer.content
            return toEmit
          }
          
          // Not in a code block - emit line by line as they complete
          const lines = buffer.content.split('\n')
          const completeLines = lines.slice(0, -1) // All but the last (potentially incomplete) line
          const completeContent = completeLines.join('\n') + (completeLines.length > 0 ? '\n' : '')
          
          if (completeContent.length > buffer.lastEmittedContent.length) {
            const toEmit = completeContent.substring(buffer.lastEmittedContent.length)
            buffer.lastEmittedContent = completeContent
            return toEmit
          }
          
          return ''
        }

        // Finalize server buffer and return remaining content
        const finalizeServerStreamBuffer = (buffer: ServerStreamBuffer): string => {
          const remaining = buffer.content.substring(buffer.lastEmittedContent.length)
          buffer.lastEmittedContent = buffer.content
          return remaining
        }

        // Helper function to preprocess content for better frontend rendering (DEPRECATED - whitespace preserved by buffer)
        const preprocessForFrontend = (chunk: string): string => {
          // No longer preprocessing to preserve exact whitespace
          // Server-side buffering handles formatting
          return chunk
        }

        // Create a readable stream that handles both preprocessing results and JSON commands
        const stream = new ReadableStream({
          async start(controller) {
            // First, send preprocessing tool results if available
            if (hasToolCalls && preprocessingResults) {
              const processedToolCalls = preprocessingResults.toolCalls?.map((toolCall: any, index: number) => {
                const toolResultItem = preprocessingResults.toolResults?.[index]
                return {
                  id: toolCall.toolCallId,
                  name: toolCall.toolName || 'unknown',
                  args: toolResultItem?.input || toolCall.args || {},
                  result: toolResultItem?.output || toolResultItem || null
                }
              }) || []

              const hasToolErrors = processedToolCalls.some((tc: any) => (tc.result as any)?.success === false)
              
              const toolData = {
                type: 'tool-results',
                toolCalls: processedToolCalls,
                hasToolCalls: true,
                hasToolErrors,
                serverSideExecution: true,
                fileOperations: [] // No file operations in read-only phase
              }
              
              console.log('[PREPROCESSING] Sending preprocessing results:', JSON.stringify({
                type: 'tool-results',
                toolCallsCount: processedToolCalls.length,
                hasToolErrors,
                toolNames: processedToolCalls.map((tc: any) => tc.name)
              }, null, 2))
              
              controller.enqueue(`data: ${JSON.stringify(toolData)}\n\n`)
            }
            
            // Start streaming the main response with JSON command support
            let result;
            
            // SPECIAL HANDLING: a0.dev uses custom streaming, not AI SDK streamText
            if (modelId === 'a0-dev-llm') {
              console.log('[A0-DEV] Using custom a0.dev streaming instead of AI SDK streamText');
              
              // Convert AI SDK messages to a0.dev format with message limit
              // a0.dev may timeout with too many messages, so limit to recent conversation
              const maxMessages = 6; // Keep only the most recent messages
              const recentMessages = enhancedMessages.slice(-maxMessages);
              const a0Messages = recentMessages.map((msg: any) => ({
                role: msg.role,
                content: msg.content
              }));
              
              console.log(`[A0-DEV] Sending ${a0Messages.length} messages (${enhancedMessages.length} total, limited for performance)`);
              
              // Smart Context: DISABLED temporarily until fixed
              // const { storageManager } = await import('@/lib/storage-manager');
              // await storageManager.init();
              // const userMsg = messages[messages.length - 1]?.content || '';
              // const smartContext = await buildSmartContextForA0(projectId, userMsg, storageManager);
              
              // Direct generate: fetch once, yield full completion at once (no stream)
              result = {
                textStream: (async function* () {
                  try {
                    console.log('[A0-DEV] Making API request to a0.dev with', a0Messages.length, 'messages');
                    const response = await fetch('https://api.a0.dev/ai/llm', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({
                        messages: a0Messages,
                        temperature: 0.3,
                        stream: false
                        // projectFiles: smartContext.selectedFiles,  // DISABLED
                        // srcPatch: smartContext.srcPatch  // DISABLED
                      }),
                      signal: AbortSignal.timeout(32000)
                    });
                    console.log('[A0-DEV] API response status:', response.status);
                    if (!response.ok) {
                      const errorText = await response.text().catch(() => 'Unknown error');
                      // Log the actual error internally but don't expose it
                      console.error('[A0-DEV] API error details:', {
                        status: response.status,
                        statusText: response.statusText,
                        errorText: errorText.substring(0, 200)
                      });
                      throw new Error(`API_ERROR_${response.status}`);
                    }
                    const data = await response.json();
                    if (data.completion) {
                      yield data.completion;
                    }
                  } catch (error) {
                    console.error('[A0-DEV] Generate error:', error);
                    throw error;
                  }
                })()
              };
            } else {
              // Smart Context: DISABLED temporarily until fixed
              // const { storageManager } = await import('@/lib/storage-manager');
              // await storageManager.init();
              // const userMsg = messages[messages.length - 1]?.content || '';
              // const smartContext = await buildSmartContextForA0(projectId, userMsg, storageManager);
              
              // Add smart context to enhanced messages for standard providers
              // const smartContextMessage = {
              //   role: 'system' as const,
              //   content: `## Smart Context - Relevant Project Files
              //
              // ${smartContext.srcPatch ? `**Source Structure Changes:** ${smartContext.srcPatch}\n\n` : ''}**Selected Files for Context:**
              // ${smartContext.selectedFiles.map((file: any) => 
              //   `### ${file.path}\n\`\`\`\n${file.content}\n\`\`\``
              // ).join('\n\n')}
              //
              // Use this context to provide accurate, file-aware responses to the user's request.`
              // };
              
              // const enhancedMessagesWithContext = [smartContextMessage, ...enhancedMessages];
              
              // Standard AI SDK streaming for all other providers
              result = await streamText({
                model: model,
                messages: enhancedMessages,
                temperature: 0.3,
                abortSignal: abortController.signal,
              });
            }
            
            // Initialize response accumulation and tool tracking for memory
            let accumulatedResponse = ''
            const executedToolCalls: any[] = []
            
            // Initialize server-side stream buffer for performance
            const serverBuffer = createServerStreamBuffer()
            
            // Listen for tool execution events during streaming
            const handleToolExecution = (event: CustomEvent) => {
              console.log('[MEMORY] Tool executed during streaming:', event.detail)
              executedToolCalls.push({
                toolCallId: event.detail.toolCall?.id || `tool_${Date.now()}`,
                toolName: event.detail.action || event.detail.toolCall?.tool || 'unknown',
                args: {
                  path: event.detail.path,
                  content: event.detail.result?.contentPreview || event.detail.toolCall?.content,
                  ...event.detail.toolCall?.args
                },
                timestamp: new Date().toISOString(),
                result: event.detail.result
              })
            }
            
            // Add event listeners for tool executions
            if (typeof window !== 'undefined') {
              window.addEventListener('json-tool-executed', handleToolExecution as EventListener)
              window.addEventListener('xml-tool-executed', handleToolExecution as EventListener)
            }
            
            console.log('[SERVER-STREAM] Starting server-side buffered streaming for performance')
            
            for await (const chunk of result.textStream) {
              // Accumulate response for memory
              accumulatedResponse += chunk
              
              // Process chunk through server-side buffer (reduces client load)
              const readyToEmit = processServerStreamingDelta(serverBuffer, chunk)
              
              // Only send content when it's ready (complete lines or code blocks)
              if (readyToEmit) {
                // Detect content type for better frontend handling
                const contentType = detectContentType(readyToEmit)
                
                // Send pre-processed chunk to reduce client-side work
                controller.enqueue(`data: ${JSON.stringify({
                  type: 'text-delta',
                  delta: readyToEmit,
                  format: 'markdown',
                  contentType: contentType,
                  serverProcessed: true,
                  whitespacePreserved: true,
                  hasLineBreaks: readyToEmit.includes('\n'),
                  renderHints: {
                    isCodeBlock: contentType.includes('code-block'),
                    codeLanguage: contentType.startsWith('code-block-') 
                      ? contentType.replace('code-block-', '') 
                      : null
                  }
                })}\n\n`)
              }
              // else: content is buffered (inside code block or incomplete line), skip this cycle
            }
            
            // Finalize buffer and send any remaining content
            const remainingContent = finalizeServerStreamBuffer(serverBuffer)
            if (remainingContent) {
              console.log('[SERVER-STREAM] Flushing remaining buffered content')
              accumulatedResponse += remainingContent // Ensure it's in accumulated response
              
              const contentType = detectContentType(remainingContent)
              controller.enqueue(`data: ${JSON.stringify({
                type: 'text-delta',
                delta: remainingContent,
                format: 'markdown',
                contentType: contentType,
                serverProcessed: true,
                whitespacePreserved: true,
                isFinalChunk: true
              })}\n\n`)
            }
            
            // Clean up event listeners
            if (typeof window !== 'undefined') {
              window.removeEventListener('json-tool-executed', handleToolExecution as EventListener)
              window.removeEventListener('xml-tool-executed', handleToolExecution as EventListener)
            }
            
            // After streaming is complete, store memory with full AI response
            try {
              const userMessage = messages[messages.length - 1]?.content || ''
              console.log('[MEMORY] Processing stream memory for AI response analysis...')
              console.log('[MEMORY] Accumulated response length:', accumulatedResponse.length)
              console.log('[MEMORY] Executed tool calls:', executedToolCalls.length)
              
              // Store memory asynchronously (don't block response)
              // DISABLED: Memory functionality temporarily disabled for future use
              /*
              storeStreamMemory(
                projectId,
                user?.id || 'anonymous',
                userMessage,
                accumulatedResponse, // Full accumulated AI response
                projectContext || ''
              ).then((memory) => {
                console.log('[MEMORY] Stream memory stored successfully:', {
                  memoryId: memory.id,
                  jsonOperations: memory.jsonOperations.length,
                  mainPurpose: memory.actionSummary.mainPurpose,
                  filesAffected: memory.jsonOperations.map(op => `${op.jsonTool}:${op.filePath}`)
                })
              }).catch((error) => {
                console.error('[MEMORY] Failed to store stream memory:', error)
              })
              */
              
            } catch (memoryError) {
              console.error('[MEMORY] Memory processing error:', memoryError)
            }
            
            controller.enqueue(`data: [DONE]\n\n`)
            controller.close()
          }
        })

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        })
      } catch (error: unknown) {
        console.error('Chat API Error:', error)

        // Check if it's a Mistral API error
        if (error && typeof error === 'object' && 'message' in error) {
          const errorMessage = (error as { message?: string }).message
          if (errorMessage?.includes('Service unavailable') || errorMessage?.includes('Internal Server Error')) {
            return new Response(JSON.stringify({
              error: 'AI service temporarily unavailable. Please try again in a moment.',
              details: 'The Mistral AI service is currently experiencing issues.'
            }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            })
          }
        }

        // Return appropriate error response
        if (error instanceof Error) {
          return new Response(`Error: ${error.message}`, { status: 500 })
        }

        return new Response('Internal Server Error', { status: 500 })
      }
    }
  } catch (error: unknown) {
    console.error('Unexpected error in chat API:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}
