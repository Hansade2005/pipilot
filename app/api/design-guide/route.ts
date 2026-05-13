import { z } from 'zod'

// a0 LLM API — generates project-specific design systems
const A0_LLM_URL = 'https://api.a0.dev/ai/llm'

const schema = z.object({
  projectType: z.string().min(1, 'projectType is required'),
  userMessage: z.string().optional(),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { projectType, userMessage } = schema.parse(body)

    console.log(`[design-guide] Generating design for: ${projectType}`)

    const response = await fetch(A0_LLM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: `You are a UI design director. Return a compact JSON design system. BANNED: Inter, Roboto, Arial, Poppins fonts. BANNED: purple gradients, floating blobs, emojis as icons. Every project gets unique fonts, colors, aesthetic. Vary light/dark themes. Return ONLY valid JSON, no markdown.`
          },
          {
            role: 'user',
            content: `Design system for "${projectType}".${userMessage ? `\nUser's request: "${userMessage}"` : ''}\nReturn JSON:
{"a":"aesthetic direction","df":"Google Font for headings","bf":"Google Font for body","p":"#primary","pl":"#primaryLight","ac":"#accent","s":"#surface","sa":"#surfaceAlt","t":"#text","tm":"#textMuted","bd":"#border","ds":"#darkSurface","dt":"#darkText","hero":"hero section style","layouts":"3 layout patterns comma-separated","motion":"2 animation choices comma-separated","texture":"background texture approach","unique":"one memorable design element","heading":"hero heading text","sub":"hero subtext","cta":"CTA button text","sections":"3 section headings comma-separated"}`
          }
        ],
        temperature: 0.9,
        max_tokens: 500
      })
    })

    if (!response.ok) throw new Error(`a0 API returned ${response.status}`)
    const data = await response.json()
    const text = data.completion || ''

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')
    const d = JSON.parse(jsonMatch[0])

    // Build detailed guide server-side from compact LLM response
    const layouts = (d.layouts || '').split(',').map((l: string) => l.trim()).filter(Boolean)
    const motions = (d.motion || '').split(',').map((m: string) => m.trim()).filter(Boolean)
    const sections = (d.sections || '').split(',').map((s: string) => s.trim()).filter(Boolean)

    const guide = `# Design System for "${projectType}"

## Aesthetic Direction
${d.a}

## Typography
- **Display font**: ${d.df} (headings, hero text)
- **Body font**: ${d.bf} (paragraphs, UI text)
- Import via Google Fonts \`<link>\` tag in index.html
- CSS variables: \`--font-display: '${d.df}', serif;\` and \`--font-body: '${d.bf}', sans-serif;\`

## Color Palette
- Primary: ${d.p} | Primary Light: ${d.pl} | Accent: ${d.ac}
- Surface: ${d.s} | Surface Alt: ${d.sa}
- Text: ${d.t} | Text Muted: ${d.tm} | Border: ${d.bd}
- Dark mode surface: ${d.ds || '#111'} | Dark mode text: ${d.dt || '#f5f5f5'}

## CSS Variables (paste into index.css)
:root { --font-display: '${d.df}', serif; --font-body: '${d.bf}', sans-serif; --color-primary: ${d.p}; --color-primary-light: ${d.pl}; --color-accent: ${d.ac}; --color-surface: ${d.s}; --color-surface-alt: ${d.sa}; --color-text: ${d.t}; --color-text-muted: ${d.tm}; --color-border: ${d.bd}; }

## Layout Strategy
${layouts.map((l: string, i: number) => `${i + 1}. ${l}`).join('\n')}

## Hero Section
${d.hero}

## Motion & Animations
${motions.map((m: string) => `- ${m}`).join('\n')}
- Page load: staggered fadeInUp with animation-delay per element
- Cards: hover:shadow-xl hover:-translate-y-2 transition-all duration-300
- Buttons: active:scale-95 transition-transform

## Background & Texture
${d.texture || 'Subtle gradient or grain overlay for depth — never flat solid colors alone.'}

## Unique Memorable Element
${d.unique}

## Icons
Use Lucide React icons consistently (20px, stroke-width 1.5). NEVER use emojis as icons.

## Mobile-First Responsive (mandatory)
- Nav: hamburger menu on mobile → horizontal nav on desktop
- Grids: grid-cols-1 → md:grid-cols-2 → lg:grid-cols-3
- Hero text: text-3xl → md:text-5xl lg:text-6xl
- Spacing: px-4 py-12 mobile → px-8 py-24 desktop
- Touch targets: min 44x44px. No horizontal overflow.
- Footer: stack vertically on mobile, grid on desktop

## Sample Copy
- **Hero heading**: "${d.heading}"
- **Hero subtext**: "${d.sub}"
- **CTA button**: "${d.cta}"
- **Section headings**: ${sections.map((s: string) => `"${s}"`).join(', ')}

## Reminders
- Images: https://api.a0.dev/assets/image?text={description}&aspect=16:9
- Real content: specific names, prices, dates — never lorem ipsum
- Every dark:bg-* needs matching dark:text-* on all children
- Build ALL pages fully — never "coming soon" placeholders

Apply this design system to every file you create.`

    return Response.json({ success: true, guide, design: d })
  } catch (error) {
    console.error('[design-guide] Error:', error)

    // Fallback guide
    const projectType = (await request.clone().json().catch(() => ({}))).projectType || 'project'
    return Response.json({
      success: true,
      fallback: true,
      guide: `# Design Guide (fallback for "${projectType}")

## Typography
Pick a distinctive Google Font pairing (NOT Inter/Roboto/Arial). Example: Playfair Display + Source Sans 3.

## Colors
Choose a dominant color with sharp accent. Define as CSS variables.

## Layout
Mix layout patterns: bento grid, split hero 60/40, asymmetric columns.

## Mobile-First Responsive (mandatory)
- Hamburger menu on mobile, horizontal nav on desktop
- grid-cols-1 → md:grid-cols-2 → lg:grid-cols-3
- Touch targets: min 44x44px. No horizontal overflow.

## Icons
Use Lucide React icons (20px, stroke-width 1.5). NEVER use emojis as icons.

## Images
Use https://api.a0.dev/assets/image?text={description}&aspect=16:9 for all images.`
    })
  }
}
