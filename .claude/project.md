# PiPilot - Project Context & Change Log

> This file is read by Claude at session start. It provides current project state,
> recent changes, and feature inventory so new sessions have full context without
> re-exploring the codebase. **Update this file after every significant change.**

---

## Current State (as of 2026-03-18, session 2)

- **Production URL:** https://pipilot.dev
- **Framework:** Next.js 14+ (App Router) / Tailwind / shadcn/ui
- **Package Manager:** pnpm
- **Branch strategy:** main (production), feature branches as needed
- **AI SDK:** Vercel AI SDK v5 (use `stopWhen`, NOT `maxSteps`)

---

## Supabase Projects

| Role | Project ID | Purpose |
|------|-----------|---------|
| **Main App** | `lzuknbfbvpuscpammwzg` | Auth, billing, wallet, personas, snapshots, secrets, teams, organizations, **ollama_keys** |
| **Agent Cloud** | `dlunpilhklsgvkegnnlp` | Agent sessions, messages, MCP connectors, hosted sites, site analytics |

Both accessible via the same Management API token (see `local-supabase-credentials.md`).

---

## Feature Inventory

### Workspace (Main Product) - `/workspace`
Users build fullstack apps via conversational AI.

| Feature | Key Files | Status |
|---------|----------|--------|
| AI Chat (code generation) | `app/api/chat-v2/route.ts`, `app/workspace/page.tsx` | Live |
| Visual click-to-edit | `app/api/visual-editor/` | Live |
| Live preview (iframe) | workspace page | Live |
| Voice input | workspace page | Live |
| Multi-chat sessions | workspace page | Live |
| AI Memory system | workspace page | Live |
| Slash commands | workspace page | Live |
| Codebase search & replace | workspace page | Live |
| GitHub sync | `app/api/github/` | Live |
| Vercel deploy | `app/api/vercel/`, `app/api/deploy/` | Live |
| Netlify deploy | `app/api/netlify/` | Live |
| Supabase integration | `app/api/supabase/`, `app/api/database/` | Live |
| Stripe integration | `app/api/stripe/` | Live |
| Tool Discovery System | `app/api/chat-v2/route.ts` (TOOL_REGISTRY + discover_tools + prepareStep) | Live |
| Inline Tool Pills | `components/workspace/message-with-tools.tsx` | Live |
| DB-backed Ollama Key Rotation | `lib/ai-providers.ts` + `ollama_keys` table | Live |

### Agent Cloud - `/agent-cloud`
Cloud-based AI coding agent with E2B sandboxes.

| Feature | Key Files | Status |
|---------|----------|--------|
| Session management | `app/agent-cloud/`, `app/api/agent-cloud/` | Live |
| Message persistence | Supabase (dlunpilhklsgvkegnnlp) | Live |
| MCP connectors | `app/agent-cloud/settings/`, `app/api/agent-cloud/` | Live |
| Model selector | Session page input | Live |
| Tool output rendering (diffs, todos, syntax highlighting) | Session page | Live |
| Image attachments (IndexedDB) | Session page | Live |
| Bonsai AI provider (round-robin keys) | Agent cloud API | Live |
| Lazy-load messages | Session page | Live |

### Developer Power Tools (2026-02-25)

| Feature | UI Route | API Route | DB Table (Main) |
|---------|---------|-----------|-----------------|
| Usage Analytics | `/workspace/usage` | `/api/usage/` | `usage_logs`, `wallet` |
| AI Personas | `/workspace/personas` | `/api/personas/` | `ai_personas` |
| Project Snapshots | `/workspace/snapshots` | `/api/snapshots/` | `project_snapshots` |
| Project Health Score | `/workspace/health` | `/api/health-score/` | (computed on-demand) |
| Secrets Vault (AES-256-GCM) | `/workspace/secrets` | `/api/secrets/` | `project_secrets`, `secret_access_logs` |
| AI Code Review | `/workspace/code-reviews` | `/api/code-reviews/` | (computed on-demand) |
| Scheduled Tasks | `/workspace/scheduled-tasks` | `/api/scheduled-tasks/` | (planned: `scheduled_tasks`) |
| Project Showcase | `/workspace/showcase` | `/api/showcase/` | (planned: `showcase_projects`) |

### Marketing / Content Pages

| Page | Route | Notes |
|------|-------|-------|
| Landing page | `/` | Hero, chat input, projects, templates, trust layer |
| Pricing | `/pricing` | Free / Creator $25 / Collaborate $75 / Scale $150 |
| Docs | `/docs` | AI-searchable docs with search_docs tool |
| Support | `/support` | FAQ + AI chatbot with screen sharing |
| Blog | `/blog` | Static blog posts |
| Features | `/features` | Feature showcase pages |
| About | `/about` | Company info |
| Showcase | `/showcase` | Public project gallery |
| Templates | `/templates` (section on landing) | App templates |

---

## Recent Changes (Chronological)

### 2026-03-18 (Session 2) — AI Agent Speed & Output Discipline
Overhauled the workspace AI system prompt to eliminate verbose narration between tool calls, making the agent build apps significantly faster.

#### TOOL-ONLY MODE — Core Change
- **Added "TOOL-ONLY MODE" rule** across all three system prompts (Plan & Build, Web Architect, UI Prototyping)
- **New behavior:** After `generate_plan`, AI calls tools back-to-back with ZERO text explanations between them. Text summary only output AFTER all steps are completed.
- **Before:** Plan → "Let me create the config..." → write_file → "Now I'll set up routing..." → write_file → ...
- **After:** Plan → write_file → write_file → write_file → ... → "Here's what was built: ..."

#### System Prompt Changes (all in `app/api/chat-v2/route.ts`)
- **Plan & Build mode (~line 2704):** Added 4-phase flow: Recon → Plan → Tool-Only Build → Summary. Added OUTPUT DISCIPLINE section with explicit anti-narration rules.
- **Response Format (~line 2754):** Step 4 now says "TOOL-ONLY MODE" — zero text between tool calls.
- **Critical instruction (~line 2771):** Changed "keep it minimal" to "enter TOOL-ONLY MODE...only output text summary after all steps completed."
- **Web Architect mode (~line 2921):** Added tool-only build principle.
- **UI Prototyping mode (~line 121):** Replaced old 5-step WORKFLOW with "PLAN THEN TOOL-ONLY BUILD" + OUTPUT DISCIPLINE.
- **Continuation mode (~line 3251):** Added "switch to TOOL-ONLY MODE" after re-reading context files. Kept file re-reads (needed since tool results aren't sent in continuations).
- **Recovery mode (~line 3314):** Same tool-only mode addition after re-reads.

#### What Was Preserved
- Step limit: 2-10 (unchanged)
- Continuation file re-reads: kept (AI needs them since tool results aren't sent)
- Recovery file re-reads: kept
- Persistence rules (always read plan.md/project.md): kept
- update_plan_progress per step: kept

### 2026-03-18 (Session 1) — Session Summary
Major model catalog expansion + Ollama DB rotation + tool fixes + pill accuracy.

#### Ollama Cloud Model Catalog Expansion
- **Added 4 new models:** `qwen3-coder:480b`, `qwen3-coder-next`, `qwen3.5:397b`, `deepseek-v3.1:671b`
- All added to: `lib/ai-models.ts`, `lib/ai-providers.ts`, `lib/billing/model-pricing-data.ts`, `components/ui/model-selector.tsx`
- All Ollama Cloud models now available to **free users** (not just premium)
- Model selector dropdown max-height reverted to 380px after testing

#### DB-Backed Ollama Key Rotation System
- **New table:** `ollama_keys` in Supabase (pixelai DB) — 58 keys seeded
- **Smart rotation:** Picks key with fewest `requests_in_window` + oldest `last_used_at`
- **Concurrency lock:** `in_use` boolean per key (Ollama free tier = 1 concurrent request)
- **5hr window tracking:** `requests_in_window` counter, auto-resets when window expires
- **Weekly tracking:** `requests_in_week` counter, auto-resets after 7 days
- **Error tracking:** `consecutive_errors` counter, auto-disables key at 5 errors
- **Stale lock recovery:** Keys stuck `in_use` > 3 min auto-released (crashed requests)
- **Fallback:** If DB unavailable, falls back to env-based round-robin
- **Integration:** `getAIModel()` in route.ts is now async, returns `{ model, ollamaKeyId }`
- **Release:** `releaseOllamaKey()` called in `finally` block after streaming completes/errors
- **Files changed:** `lib/ai-providers.ts` (new functions: `getOllamaModel`, `getOllamaCloudProviderFromDB`, `releaseOllamaKey`), `app/api/chat-v2/route.ts` (async getAIModel, import new functions, release in finally)

#### Inline Tool Pill Accuracy Improvements
- **Forward-only snapping:** Pills snap forward to next newline within 30 chars (not ±50 bidirectional)
- **Sentence boundary fallback:** Snaps to `.` `!` `?` when no newline nearby
- **Deduplication:** `Set<string>` dedup by `toolCallId` — no duplicate pills
- **Fixed reasoning vs text classification:** Tools with `textPosition=0` + `reasoningPosition>0` now only appear in reasoning (not text stream)
- **Old-format reasoning filter:** Only passes tools with `reasoningPosition > 0` to reasoning InterleavedContent
- **Tighter spacing:** `space-y-1`, `my-1` for pills
- **File:** `components/workspace/message-with-tools.tsx`

#### list_files Tool Fixes
- `"."`, `"./"`, `"/"`, `""` now correctly treated as root directory (was matching as subdirectory prefix)
- Subdirectory paths normalized: strips `./`, leading `/`, trailing `/`, mid-path `./`
- **File:** `app/api/chat-v2/route.ts` (list_files execute handler)

#### Commits This Session
1. `8991b209` — Add Qwen3 and DeepSeek V3.1 models to Ollama Cloud catalog
2. `5bfc10c5` — Revert model selector dropdown height back to 380px
3. `2ab55df5` — Improve inline tool pill positioning accuracy in chain of thought
4. `e3443fa8` — Fix list_files treating '.' and './' as subdirectory instead of root
5. `1c2c058c` — Harden list_files path normalization for ./ and mid-path ./ patterns
6. `eaeedc1a` — Add DB-backed Ollama key rotation with rate limit tracking

### 2026-03-17 (prior session)
- Tool Discovery System (`TOOL_REGISTRY` + `discover_tools` + `prepareStep`)
- Slim core tools to 13, heavy tools discoverable
- Major streaming performance overhaul (RAF batching, smoothStream delay:0, scrollTop vs scrollIntoView)
- Deploy preview returns plain text (context overhead fix)
- Fix generate_plan crash, deep link toast error, plan/context pill visibility
- Add client_replace_string_in_file and browse_web to core tools

### 2026-02-25
- **Developer Power Tools launch** - 8 features in one sprint
- Custom HTTP streamable MCP servers for agent cloud

### 2026-02-22
- Removed meta/llama-4-scout model
- Refactored Bonsai models: removed from workspace, kept only in agent-cloud

### 2026-02-20
- **Agent Cloud UI overhaul**
- **Bonsai AI provider:** Round-robin key rotation
- **Landing page:** Universe starfield, floating rocks

---

## Key Architecture Decisions

1. **Two Supabase projects** - Main app (auth/billing) vs Agent Cloud (sessions/messages) for isolation
2. **No FK constraints in agent cloud** - Soft references for E2B sandbox lifecycle flexibility
3. **RLS off on agent_cloud_* tables** - Access controlled at API layer (service role)
4. **Token-based billing** - Credits consumed per AI request, not flat message limits
5. **E2B sandboxes** - Agent Cloud runs code in isolated cloud sandboxes
6. **Bonsai provider** - Round-robin API key rotation for agent cloud models
7. **IndexedDB for images** - Agent cloud images stored client-side, not in Supabase
8. **Orange accent brand** - Consistent theme defined in `.claude/rules/brand-theme.md`
9. **DB-backed Ollama rotation** - 58 keys in `ollama_keys` table, smart rotation respecting concurrency/window/weekly limits
10. **Tool Discovery System** - 68 tools in registry, 13 core tools always available, rest unlocked via `discover_tools` + `prepareStep`
11. **AI-powered project detection** - `detectProjectTypeWithAI()` via a0 LLM API instead of fragile path checks
12. **Path normalization at ingestion** - All file paths stripped of leading `/` at session storage ingestion

---

## AI Models in Use

### Workspace Models (Model Selector)

| Provider | Models | Tier |
|----------|--------|------|
| Ollama Cloud | Claude Opus 4.6 (minimax-m2.5), Claude Sonnet 4.6 (minimax-m2.1) | Free + Premium |
| Ollama Cloud | Devstral 2 123B, DeepSeek V3.1 671B, DeepSeek V3.2 | Free + Premium |
| Ollama Cloud | Qwen3 Coder 480B, Qwen3 Coder Next, Qwen3.5 397B | Free + Premium |
| Ollama Cloud | Kimi K2.5, Kimi K2 Thinking, Kimi K2 1T, GLM 4.6, GLM 4.7 | Free + Premium |
| Vercel Gateway | Devstral 2, Devstral Small 2, Grok Code Fast 1 | Free + Premium |
| Kilo Gateway | Kilo Auto, MiniMax M2.5, Kimi K2.5, Giga Potato, Step Flash | Free + Premium |
| Custom | Codestral (Mistral), Pixela (a0.dev), Pixtral 12B (vision) | Various |

### Other Contexts
| Context | Models |
|---------|--------|
| Agent Cloud | Bonsai models (round-robin), all workspace models |
| Support chat | Mistral Pixtral (vision-enabled) |
| Auto/Default | Grok Code Fast 1 (xAI direct) |
| Fallback | Grok Code Fast 1 (when primary model fails) |

---

## Ollama Key Rotation (DB Schema)

**Table:** `public.ollama_keys` (pixelai DB: `lzuknbfbvpuscpammwzg`)
**Keys:** 58 active keys
**Rate limits per key (free tier):** 1 concurrent request, ~5hr session window, 7-day weekly reset

| Column | Type | Purpose |
|--------|------|---------|
| `api_key` | TEXT UNIQUE | The Ollama API key |
| `last_used_at` | TIMESTAMPTZ | When key was last used |
| `requests_in_window` | INT | Requests in current 5hr window |
| `window_start_at` | TIMESTAMPTZ | When current 5hr window started |
| `requests_in_week` | INT | Total requests this week |
| `week_start_at` | TIMESTAMPTZ | When current week started |
| `in_use` | BOOLEAN | Currently serving a request (concurrency lock) |
| `is_active` | BOOLEAN | False = disabled (revoked/dead) |
| `consecutive_errors` | INT | Auto-disables at 5 |

---

## Important File Paths

```
app/api/chat-v2/route.ts           # Main AI chat API (~12k lines)
app/workspace/page.tsx              # Main workspace UI
app/agent-cloud/                    # Agent Cloud pages
app/api/agent-cloud/                # Agent Cloud API routes
lib/ai-providers.ts                 # All AI provider factories + Ollama DB rotation
lib/ai-models.ts                    # Model registry (chatModels array)
lib/billing/model-pricing-data.ts   # Per-model pricing data
lib/billing/credit-manager.ts       # Credit deduction + billing logic
lib/stripe-config.ts                # Pricing/plan configs
lib/supabase.ts                     # Supabase client setup (getServerSupabase)
lib/utils.ts                        # detectProjectTypeWithAI, filterUnwantedFiles
lib/client-file-tools.ts            # Client-side file operation handlers
components/ui/model-selector.tsx    # Model selector dropdown (shortNameMap, modelOrder, allowedModels)
components/workspace/message-with-tools.tsx  # Tool pills + InterleavedContent positioning
components/workspace/chat-panel-v2.tsx       # Frontend streaming + tool call tracking
components/workspace/workspace-layout.tsx    # Main workspace layout + file editor
components/navigation.tsx           # Main nav bar
components/footer.tsx               # Site footer
public/docs.json                    # Searchable documentation data
.claude/rules/brand-theme.md        # Orange accent color system
.claude/rules/playwright-browser-testing.md  # Browser testing setup
```

---

## Known Issues / TODO

- **Ollama keys:** Only 58 of ~80 keys inserted. User may paste remaining keys.
- **Last key possibly truncated:** `04b9571450a142ceb9ec2dc74e4227e3.JfzI4` looks short.
- **Ollama rotation untested in prod:** Keys all show `last_used_at: null` — need live traffic to verify.
- **list_files in clientSideTools:** `list_files` is in the client-side tools array in chat-panel-v2.tsx (4 places) but has no handler in `client-file-tools.ts`. Currently handled server-side via the tool's `execute` function. Consider removing from client-side arrays to avoid confusion.
