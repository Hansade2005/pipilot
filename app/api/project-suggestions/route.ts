import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

// a0 LLM API — free, no auth required
const A0_LLM_URL = 'https://api.a0.dev/ai/llm'

const generateProjectSuggestionSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  userId: z.string().min(1, 'User ID is required'),
})

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { prompt, userId } = generateProjectSuggestionSchema.parse(body)

    if (userId !== user.id) {
      return Response.json({ error: 'User ID mismatch' }, { status: 403 })
    }

    console.log('🎯 Generating project suggestion for prompt:', prompt)

    const response = await fetch(A0_LLM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: `You are a product naming specialist. Given a user's app description, return ONLY a valid JSON object with two fields:
- "name": A catchy, professional project name (max 30 chars). Use patterns like compound words (TaskFlow), portmanteau (Pinterest), action-based (ShipFast), or metaphorical (Compass). Avoid generic names.
- "description": A clear description of what the app does including key features (max 200 chars).

Examples:
{"name":"TeamCanvas","description":"A real-time collaborative whiteboard for remote teams with infinite canvas, drawing tools, sticky notes, and seamless synchronization."}
{"name":"ChefMind","description":"An AI-powered recipe engine that generates meal suggestions based on available ingredients, dietary restrictions, and nutritional preferences."}

Return ONLY the JSON object. No markdown, no explanation.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.85,
        max_tokens: 200
      })
    })

    if (!response.ok) {
      throw new Error(`a0 API returned ${response.status}`)
    }

    const data = await response.json()
    const text = data.completion || ''

    console.log('🤖 a0 LLM response:', text)

    let suggestion
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        suggestion = JSON.parse(jsonMatch[0])
      } else {
        suggestion = JSON.parse(text)
      }

      if (!suggestion.name || !suggestion.description) {
        throw new Error('Missing required fields')
      }

      if (suggestion.name.length > 50) {
        suggestion.name = suggestion.name.substring(0, 47) + '...'
      }
      if (suggestion.description.length > 300) {
        suggestion.description = suggestion.description.substring(0, 297) + '...'
      }
    } catch (parseError) {
      console.error('❌ Failed to parse AI response:', parseError)
      const words = prompt.split(' ').slice(0, 3).join(' ')
      suggestion = {
        name: words.charAt(0).toUpperCase() + words.slice(1).toLowerCase() + ' App',
        description: `A web application for ${prompt.toLowerCase()}.`
      }
    }

    console.log('✅ Generated project suggestion:', suggestion)

    return Response.json({
      success: true,
      suggestion: {
        name: suggestion.name,
        description: suggestion.description,
      }
    })

  } catch (error) {
    console.error('❌ Error generating project suggestion:', error)

    if (error instanceof z.ZodError) {
      return Response.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      )
    }

    return Response.json(
      { error: 'Failed to generate project suggestion' },
      { status: 500 }
    )
  }
}
