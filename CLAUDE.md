# PiPilot - AI Agent Context File

## What is PiPilot?

**PiPilot** is Canada's first Agentic Vibe Coding Platform - an AI-powered application builder that helps users create web applications through natural conversation. It's designed to be the most automated AI coding platform, surpassing tools like Lovable, Bolt, Cursor, and Windsurf.

**Tagline:** "Build apps by talking to AI"

## Founder

- **Name:** Hans Ade (Full name: Anye Happiness Ade)
- **Role:** Founder & CEO
- **Company:** Pixelways Solutions Inc (Ontario, Canada)
- **Contact:** hello@pipilot.dev, hanscadx8@gmail.com
- **Founded:** July 29, 2025

## Supported AI Models

PiPilot uses multiple AI models for different purposes:
- **Mistral Pixtral** - Vision-enabled model for the support chat (analyzes screenshots/images)
- **Grok Code Fast 1** - Fast code generation in workspace
- **Claude Sonnet 4.5** - High-quality code generation and analysis

## Supported Frameworks

1. **Next.js** - Full-stack web applications with SSR/SSG
2. **Vite + React** - Client-side SPAs and interactive tools
3. **Expo** - Cross-platform mobile apps (iOS, Android, Web)

## Key Features

### Core Platform
- Conversational AI development (chat to build apps)
- Visual click-to-edit interface
- Real-time live preview
- Voice input support
- Multi-chat sessions with branching
- AI Memory system (remembers project context)
- Slash commands (/help, /export, /settings, etc.)
- Codebase search & replace

### Integrations
- GitHub (repository management, PR creation)
- Vercel (one-click deployment)
- Netlify (static hosting)
- Supabase (database, auth, storage)
- Stripe (payments)

### Support System (Unique Features)
- AI chatbot on /support and /docs pages
- Persistent screen sharing (auto-captures every message)
- Multimodal support (images, documents, screenshots)
- Real-time documentation search (search_docs tool)
- Tawk.to live chat fallback

### HTML-to-React Converter (Planned Feature)
PiPilot will offer an HTML/CSS/JS to Vite+React conversion tool — a feature with proven market demand and no fully automated competitor.

**Input Methods (upload first, then convert):**
1. **Upload ZIP** — user uploads a `.zip` containing their HTML/CSS/JS project
2. **GitHub repo** — connect to a repo containing the HTML site
3. **Import folder** — select a local folder with the HTML project files
4. **Paste URL** — enter a live site URL, PiPilot pulls the HTML, CSS, JS, and image assets

All four methods load the raw HTML/CSS/JS files into the workspace. Then the AI conversion pipeline transforms them into a Vite+React project.

**Conversion Pipeline (AI-powered via chat-v2):**
1. Analyze the uploaded project structure
2. Split HTML into React components (header, footer, nav, sections, etc.)
3. Convert vanilla JS (DOM manipulation, event listeners) to React hooks/state (`useState`, `useEffect`)
4. Convert CSS to Tailwind or CSS modules
5. Replace CDN dependencies with npm packages
6. Scaffold a proper Vite+React project structure

**Existing Infrastructure (in `components/chat-input.tsx`):**
- ZIP import handler (`handleZipImport`) — already built
- Folder import handler (`handleFolderImport`) — already built
- GitHub import handler (`handleGithubImport`) — already built
- URL scraper — needs to be built (new API route to fetch & extract site assets)

**Market Context:**
- No existing tool does full end-to-end HTML project to Vite+React conversion
- Funded competitors (Kombai $4.5M, Locofy $7.3M) convert from Figma, not HTML
- Active freelance market on Fiverr/Upwork for manual HTML-to-React conversion ($5-$75/hr)
- `html-react-parser` npm package has ~2.8M weekly downloads showing demand at the HTML-React boundary

---

## Important Files & Architecture

### Main Chat/Workspace (User builds apps here)
```
app/api/chat-v2/route.ts          # Main AI chat API (10000+ lines, handles all workspace AI)
app/workspace/page.tsx             # Main workspace UI where users build apps
```

### Support & Documentation Chat
```
app/api/support-chat/route.ts      # Support chat API with search_docs tool
app/support/page.tsx               # Support page with FAQ + AI chatbot
app/docs/page.tsx                  # Documentation page with AI assistant
```

### Layout & Navigation
```
app/layout.tsx                     # Root layout (includes Tawk.to script)
components/navigation.tsx          # Main navigation bar
components/footer.tsx              # Site footer
```

### Documentation Data
```
public/docs.json                   # All documentation content (searchable by AI)
```

### Key Components
```
components/ai-elements/response.tsx  # Markdown rendering for AI responses (Streamdown)
components/ui/                       # shadcn/ui components
```

---

## API Routes Overview

| Route | Purpose |
|-------|---------|
| `/api/chat-v2` | Main workspace AI (code generation, file ops, tools) |
| `/api/support-chat` | Support/docs AI with search_docs tool |
| `/api/generate-*` | Various generation endpoints |

---

## Tech Stack

- **Framework:** Next.js 14+ (App Router)
- **Styling:** Tailwind CSS
- **UI Components:** shadcn/ui
- **AI SDK:** Vercel AI SDK v5
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth
- **Deployment:** Vercel

---

## Code Patterns

### AI SDK v5 Usage
```typescript
import { streamText, tool, stepCountIs } from 'ai'

const result = await streamText({
  model,
  system: systemPrompt,
  messages,
  tools: { ... },
  stopWhen: stepCountIs(3),  // NOT maxSteps (deprecated)
})

return result.toTextStreamResponse()
```

### Tool Definition
```typescript
tools: {
  search_docs: tool({
    description: 'Search documentation...',
    parameters: z.object({
      query: z.string(),
      maxResults: z.number().optional()
    }),
    execute: async ({ query, maxResults }) => {
      // Tool logic
    }
  })
}
```

### Multimodal Messages
```typescript
interface ChatMessage {
  role: 'user' | 'assistant'
  content: string | ContentPart[]
}

type ContentPart =
  | { type: 'text', text: string }
  | { type: 'image', image: string }  // base64 data URL
```

---

## Environment Variables

```
MISTRAL_API_KEY          # For Pixtral model
NEXT_PUBLIC_SUPABASE_URL # Supabase connection
SUPABASE_SERVICE_KEY     # Server-side Supabase
OPENAI_API_KEY           # OpenAI fallback
```

---

## Development Notes

1. **Don't add emojis** unless user explicitly requests
2. **Prefer editing existing files** over creating new ones
3. **Use AI SDK v5 patterns** (stopWhen, not maxSteps)
4. **Images in localStorage** are saved for display but stripped from AI context on old messages
5. **Tawk.to widget** is hidden on /support, /docs, and /workspace?projectId=* pages

---

## Package Manager

**pnpm** is the project's package manager. Always use `pnpm` (not npm or yarn) for installing dependencies, running scripts, and managing the lockfile (`pnpm-lock.yaml`).

## Quick Commands

```bash
pnpm dev      # Start development server
pnpm build    # Build for production
pnpm lint     # Run linter
pnpm add <pkg>  # Install a dependency
```
