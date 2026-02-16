import { NextRequest, NextResponse } from 'next/server'
import { generateText } from 'ai'
import { vercelGateway } from '@/lib/ai-providers'

// =============================================================================
// MODE: DESCRIBE - Neutral, detailed image description (DEFAULT)
// =============================================================================
const DESCRIBE_PROMPT = `You are a Visual Translator. Your job is to describe images so vividly and completely that someone who cannot see the image can perfectly imagine it.

# Your Task
Describe everything you see in rich detail, as if painting a picture with words. Be objective and neutral - do not assume what the user wants to do with this image.

# Description Structure

## Type & Overview
Start with what type of image this is (screenshot, photo, diagram, illustration, mockup, etc.) and a one-sentence summary.

## Visual Composition
- **Layout**: How elements are arranged (grid, list, centered, sidebar, etc.)
- **Dimensions**: Approximate proportions and spacing
- **Visual hierarchy**: What draws the eye first, second, third

## Content Details
For UI/Screenshots:
- All visible text (transcribe exactly, including labels, buttons, headings)
- Interactive elements (buttons, inputs, links, toggles)
- Data displayed (tables, lists, cards, stats)
- Navigation elements (menus, tabs, breadcrumbs)
- Status indicators (badges, icons, alerts)

For Photos/Illustrations:
- Subjects and their positions
- Actions or states depicted
- Background and foreground elements
- Notable details or features

## Visual Style
- **Colors**: Dominant colors, color scheme (dark/light mode, brand colors)
- **Typography**: Font styles (bold headings, regular text, sizes)
- **Spacing**: Dense or airy, tight or relaxed
- **Borders/Shadows**: Card styles, depth, separation
- **Icons**: Style (outline, filled, emoji) and their meanings

## Notable Elements
- Anything that stands out as important
- Unique or distinctive features
- Error states, empty states, or special conditions visible

# Guidelines
- Be thorough but organized
- Use specific descriptions ("blue button with white text" not just "button")
- Transcribe all readable text exactly
- Describe positions (top-left, center, below the header)
- Note approximate sizes (small icon, large hero image, half-width card)
- Stay neutral - describe what IS, not what should be done with it

The goal is that after reading your description, someone could accurately draw or code what you described without ever seeing the original image.`

// =============================================================================
// MODE: CLONE - Structured JSON for UI cloning/recreation
// =============================================================================
const CLONE_PROMPT = `You are a UI-to-Code Translation Engine. Your job is to analyze UI images and output a STRUCTURED JSON specification that a non-vision AI model can use to generate exact code.

# CRITICAL: OUTPUT FORMAT
You MUST output valid JSON only. No markdown, no explanations, no extra text. Just pure JSON.

# JSON Schema

{
  "pageType": "landing|dashboard|form|auth|settings|profile|list|detail|error|other",
  "theme": {
    "mode": "light|dark",
    "primaryColor": "#hex",
    "backgroundColor": "#hex",
    "textColor": "#hex",
    "accentColor": "#hex"
  },
  "layout": {
    "type": "flex-col|flex-row|grid|absolute",
    "maxWidth": "string (e.g., 'max-w-7xl', '1200px')",
    "padding": "string (e.g., 'p-4', 'px-6 py-8')",
    "gap": "string (e.g., 'gap-4', 'space-y-6')",
    "alignment": "center|start|end|stretch"
  },
  "sections": [
    {
      "id": "unique-section-id",
      "type": "navbar|hero|features|cta|footer|sidebar|content|form|grid|list|modal|card-grid",
      "layout": {
        "type": "flex-col|flex-row|grid",
        "justify": "start|center|end|between|around",
        "align": "start|center|end|stretch",
        "gap": "string",
        "padding": "string",
        "margin": "string"
      },
      "style": {
        "background": "string (color or gradient)",
        "borderRadius": "string",
        "border": "string",
        "shadow": "string"
      },
      "children": [
        {
          "component": "heading|text|button|input|image|icon|card|link|badge|avatar|divider|spacer|container|list|nav-item|logo|form-field",
          "props": {},
          "className": "Tailwind classes string",
          "children": []
        }
      ]
    }
  ]
}

# Component Props
## heading: { "level": 1-6, "text": "content", "className": "text-4xl font-bold" }
## text: { "text": "content", "variant": "body|caption|label|muted", "className": "text-base" }
## button: { "text": "Label", "variant": "primary|secondary|outline|ghost", "size": "sm|md|lg", "icon": "name|null", "className": "..." }
## input: { "type": "text|email|password|textarea|select", "placeholder": "...", "label": "...|null", "className": "..." }
## image: { "src": "description of image", "alt": "...", "aspectRatio": "16:9|4:3|1:1", "className": "..." }
## icon: { "name": "menu|search|close|arrow-right|check|user|settings", "size": "sm|md|lg", "className": "..." }
## card: { "variant": "default|elevated|outlined", "className": "...", "children": [] }
## badge: { "text": "...", "variant": "default|success|warning|error", "className": "..." }
## container: { "className": "flex items-center gap-4", "children": [] }

# Rules
1. Output ONLY valid JSON - no markdown, no explanations
2. Transcribe ALL visible text exactly
3. Use Tailwind classes for ALL styling
4. Build complete component tree with proper nesting
5. For icons, use descriptive names
6. For images, describe what they show

Analyze the image and output JSON now.`

// =============================================================================
// MODE: DEBUG - For bug reports, styling issues, visual problems
// =============================================================================
const DEBUG_PROMPT = `You are a UI Debugging Assistant. The user is showing you a screenshot of their app because something is wrong or needs fixing. Your job is to analyze the image and describe the issues you observe.

# Your Task
Carefully examine the screenshot and identify:

1. **Visual Issues**: What looks wrong, broken, or out of place?
   - Misaligned elements
   - Overlapping content
   - Incorrect spacing
   - Cut-off text or elements
   - Broken layouts

2. **Styling Problems**: What styling doesn't look right?
   - Color mismatches or inconsistencies
   - Font issues (wrong size, weight, or family)
   - Border/shadow problems
   - Background issues
   - Responsive/sizing issues

3. **UI/UX Concerns**: What hurts usability?
   - Hard to read text (contrast issues)
   - Unclear interactive elements
   - Confusing layout
   - Missing visual feedback

4. **Error Indicators**: Any visible errors?
   - Error messages in the UI
   - Console errors if visible
   - Loading states stuck
   - Empty states that shouldn't be empty

# Output Format
Provide a structured analysis:

## ISSUES IDENTIFIED

### Issue 1: [Brief title]
- **Location**: Where in the UI (top-left, navbar, card #2, etc.)
- **Problem**: What exactly is wrong
- **Expected**: What it should look like
- **Likely Cause**: Probable CSS/code issue (e.g., "missing flex-wrap", "z-index conflict")
- **Suggested Fix**: Specific code change (e.g., "add 'flex-wrap: wrap' to the container")

### Issue 2: [Brief title]
...

## ADDITIONAL OBSERVATIONS
- Any other things that look slightly off
- Potential improvements even if not bugs

Be specific about element locations and provide actionable fixes.`

// =============================================================================
// MODE: CONTEXT - For reference images when user provides context
// =============================================================================
const CONTEXT_PROMPT = `You are a Visual Context Analyzer. The user is sharing an image as a reference or example. Describe what you see in a way that helps understand their intent.

# Analyze and Describe

## 1. Overview
- What type of content is this? (UI screenshot, mockup, diagram, example, inspiration, etc.)
- What is the main subject or focus?

## 2. Visual Details
Describe the key elements:
- All visible text (transcribe important parts exactly)
- Main UI components or visual elements
- Layout structure and organization
- Color scheme and visual style

## 3. Notable Features
- What stands out as most important?
- Any unique or distinctive elements?
- Specific patterns or design choices?

## 4. Context Summary
Summarize what this image shows in a way that helps the AI understand what the user might be referencing or asking about.

Be concise but thorough. Focus on details that would be relevant for discussion or implementation.`

// =============================================================================
// API HANDLER
// =============================================================================
export async function POST(request: NextRequest) {
  try {
    const { image, prompt, mode, userMessage } = await request.json()

    if (!image) {
      return NextResponse.json(
        { error: 'Image is required' },
        { status: 400 }
      )
    }

    // Determine mode: explicit mode > default to 'describe' (neutral)
    // Note: We always use 'describe' mode for initial processing
    // The main AI will determine user intent from their actual message
    const effectiveMode = mode || 'describe'
    console.log(`[describe-image] Mode: ${effectiveMode}`)

    // Select prompt based on mode
    let systemPrompt: string
    switch (effectiveMode) {
      case 'debug':
        systemPrompt = DEBUG_PROMPT
        break
      case 'context':
        systemPrompt = CONTEXT_PROMPT
        break
      case 'clone':
      case 'structured':
        systemPrompt = CLONE_PROMPT
        break
      case 'describe':
      default:
        systemPrompt = DESCRIBE_PROMPT
        break
    }

    // If user message provided for context modes, append it
    if (userMessage && effectiveMode === 'context') {
      systemPrompt = `${systemPrompt}\n\n# USER'S MESSAGE\nThe user said: "${userMessage}"\n\nKeep this context in mind when analyzing the image.`
    }

    // Use custom prompt if explicitly provided (overrides everything)
    if (prompt) {
      systemPrompt = prompt
    }

    // Use Mistral vision model via Vercel AI Gateway to avoid rate limits
    const result = await generateText({
      model: vercelGateway()('mistral/devstral-small-2'),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: systemPrompt,
            },
            {
              type: 'image',
              image: image,
            },
          ],
        },
      ],
      temperature: effectiveMode === 'clone' ? 0.2 : 0.4,
    })

    // For clone mode, try to parse JSON
    if ((effectiveMode === 'clone' || effectiveMode === 'structured') && !prompt) {
      try {
        let jsonText = result.text.trim()

        // Remove markdown code block wrapper if present
        if (jsonText.startsWith('```json')) {
          jsonText = jsonText.slice(7)
        } else if (jsonText.startsWith('```')) {
          jsonText = jsonText.slice(3)
        }
        if (jsonText.endsWith('```')) {
          jsonText = jsonText.slice(0, -3)
        }
        jsonText = jsonText.trim()

        const parsed = JSON.parse(jsonText)

        return NextResponse.json({
          success: true,
          mode: 'clone',
          specification: parsed,
          raw: jsonText,
        })
      } catch (parseError) {
        console.warn('Failed to parse clone output as JSON:', parseError)
        return NextResponse.json({
          success: true,
          mode: 'clone',
          parseError: true,
          raw: result.text,
          description: result.text,
        })
      }
    }

    // For all other modes, return text description
    return NextResponse.json({
      success: true,
      mode: effectiveMode,
      description: result.text,
    })
  } catch (error) {
    console.error('Error describing image:', error)
    return NextResponse.json(
      { error: 'Failed to describe image', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
