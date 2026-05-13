# PiPilot Search API - Public Launch Implementation Plan

## ✅ Completed

### 1. Infrastructure ✅
- [x] Cloudflare Worker deployed at `https://pipilot-search-api.hanscadx8.workers.dev`
- [x] KV-based API key management
- [x] Global quota management system (95k/day limit with graceful degradation)
- [x] Rate limiting (per-user and global)
- [x] Comprehensive caching (90%+ hit rate)
- [x] Three endpoints: /search, /extract, /smart-search
- [x] CLI tool for API key management (`scripts/manage-keys.js`)

### 2. Stripe Products & Pricing ✅
- [x] Starter Plan: `prod_U8KFiBzqU8sSFJ` - $29/mo (`price_1TA3al3G7U0M1bp13i0ZJRpJ`)
- [x] Pro Plan: `prod_U8KFSvIHon4TPZ` - $149/mo (`price_1TA3bD3G7U0M1bp1j647lG5d`)
- [x] Free tier (no Stripe product needed)
- [x] Enterprise tier (contact sales, no Stripe product)

### 3. Documentation ✅
- [x] API.md - Complete API reference
- [x] QUOTA_MANAGEMENT.md - Quota system documentation
- [x] GitHub repository with all code

### 4. Navigation Updates ✅
- [x] Added "Search API" to Products dropdown in navigation

---

## 🚧 TODO - Launch Requirements

### Phase 1: Core Pages (Priority: Critical)

#### 1. Product Landing Page (`/api`)
**File:** `app/api/page.tsx`

**Sections:**
- Hero section with value proposition
- Live API demo (interactive code playground)
- Pricing comparison table (Free, Starter, Pro, Enterprise)
- Features showcase
- Integration examples (TypeScript, Python, cURL)
- Customer testimonials placeholder
- FAQ section
- CTA buttons (Get Started Free, View Docs, Contact Sales)

**Key Features:**
- Pricing cards with Stripe integration
- "Get Started Free" → Sign up flow
- "Upgrade" → Stripe Checkout
- Real-time API status indicator
- Code examples with copy-to-clipboard

#### 2. API Dashboard (`/dashboard/api`)
**File:** `app/dashboard/api/page.tsx`

**Features:**
- API key management
  - Generate new keys
  - View existing keys
  - Revoke keys
  - Copy to clipboard
- Usage analytics
  - Requests this month
  - Quota remaining
  - Cache hit rate
  - Response time trends
  - Endpoint usage breakdown
- Subscription management
  - Current plan
  - Billing history
  - Upgrade/downgrade options
- Live API testing console

**Database Schema (Supabase):**
```sql
CREATE TABLE api_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  tier TEXT NOT NULL, -- free, starter, pro, enterprise
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  status TEXT NOT NULL, -- active, canceled, past_due
  current_period_end TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE api_keys_metadata (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  key_hash TEXT NOT NULL UNIQUE, -- SHA-256 hash of the actual key
  key_prefix TEXT NOT NULL, -- First 8 chars for display
  key_name TEXT NOT NULL,
  tier TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  revoked BOOLEAN DEFAULT FALSE
);

CREATE TABLE api_usage_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  date DATE NOT NULL,
  requests_count INTEGER DEFAULT 0,
  cached_requests INTEGER DEFAULT 0,
  endpoint_breakdown JSONB, -- { "/search": 100, "/extract": 50 }
  avg_response_time INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 3. Documentation Page Update (`/docs`)
**File:** `app/docs/page.tsx`

**Add New Section:**
- "Search API" category in sidebar
- Auto-generated from API.md
- Subsections:
  - Getting Started
  - Authentication
  - Endpoints
  - Rate Limits & Quotas
  - Error Handling
  - SDKs & Integrations
  - Best Practices

### Phase 2: User Flow Implementation

#### 4. Subscription Checkout Flow
**Files:**
- `app/api/stripe/create-checkout/route.ts`
- `app/api/stripe/webhook/route.ts`
- `app/api/subscriptions/route.ts`

**Flow:**
1. User clicks "Upgrade to Starter/Pro"
2. Create Stripe Checkout Session
3. Redirect to Stripe
4. Handle webhook on success
5. Update Supabase subscription
6. Generate API key automatically
7. Redirect to dashboard with success message

#### 5. API Key Generation Backend
**Files:**
- `app/api/keys/generate/route.ts`
- `app/api/keys/list/route.ts`
- `app/api/keys/revoke/route.ts`

**Process:**
1. User generates key from dashboard
2. Create key in Cloudflare KV (via Worker Management API)
3. Store metadata in Supabase
4. Return key to user (only shown once)

#### 6. Usage Analytics Sync
**Files:**
- `app/api/usage/sync/route.ts` (cron job)
- `app/api/usage/stats/route.ts`

**Process:**
1. Daily cron job fetches usage from Cloudflare KV
2. Aggregates data per user
3. Stores in Supabase for dashboard display

### Phase 3: Homepage Integration

#### 7. Homepage Announcement Banner
**File:** `app/page.tsx`

**Banner:**
- Prominent announcement at top of page
- "🚀 NEW: PiPilot Search API - The cheapest AI search API for developers"
- CTA: "Explore Search API" → `/api`
- Dismissible (localStorage)

#### 8. Homepage Feature Section
**File:** `app/page.tsx`

**Add Section:**
- "Build with PiPilot APIs"
- Cards for:
  - PiPilot App Builder
  - PiPilot Database
  - **PiPilot Search API** (new!)
  - PiPilot SWE Agent

### Phase 4: Polish & Launch

#### 9. Footer Update
**File:** `components/footer.tsx`

**Add:**
- Under "Products" section:
  - Search API link

#### 10. Email Templates
**Files:**
- `lib/emails/welcome-api.tsx`
- `lib/emails/api-key-generated.tsx`
- `lib/emails/quota-warning.tsx`

**Triggers:**
- Welcome email on first API key generation
- API key generated notification
- 80% quota warning email

#### 11. Analytics & Monitoring
**Implementation:**
- Posthog events for:
  - API key generation
  - Subscription upgrades
  - API usage milestones
- Sentry error tracking for API
- Cloudflare Analytics for Worker

---

## 📋 Technical Implementation Checklist

### Backend APIs to Create

```typescript
// Subscription Management
POST /api/subscriptions/create          // Create Stripe checkout
POST /api/subscriptions/cancel          // Cancel subscription
GET  /api/subscriptions/current         // Get current subscription

// API Key Management
POST /api/keys/generate                 // Generate new API key
GET  /api/keys/list                     // List user's API keys
POST /api/keys/revoke                   // Revoke a key
GET  /api/keys/:id                      // Get key details

// Usage Analytics
GET  /api/usage/stats                   // Get usage statistics
GET  /api/usage/quota                   // Get current quota status

// Stripe Webhooks
POST /api/webhooks/stripe               // Handle Stripe events
```

### Environment Variables to Add

```env
# Stripe
STRIPE_SECRET_KEY=sk_live_xxx  # Use your Stripe secret key
STRIPE_WEBHOOK_SECRET=whsec_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxx

# Cloudflare Workers
CLOUDFLARE_ACCOUNT_ID=xxx
CLOUDFLARE_API_TOKEN=xxx  # Use your Cloudflare API token

# Search API
SEARCH_API_URL=https://pipilot-search-api.hanscadx8.workers.dev
SEARCH_API_ADMIN_KEY=admin_secret_key_here
```

### Database Migrations to Run

```bash
# Run in Supabase SQL Editor
- api_subscriptions table
- api_keys_metadata table
- api_usage_stats table
- RLS policies for each table
```

---

## 🚀 Launch Day Checklist

### Pre-Launch (1 week before)
- [ ] All pages built and tested
- [ ] Stripe products verified in live mode
- [ ] Database migrations run
- [ ] Email templates configured
- [ ] Documentation complete
- [ ] Beta testers invited (10-20 users)

### Launch Day
- [ ] Homepage banner enabled
- [ ] Social media announcement
- [ ] Blog post published
- [ ] Email to existing users
- [ ] ProductHunt launch
- [ ] HackerNews post
- [ ] Twitter/X announcement
- [ ] Discord announcement

### Post-Launch (First Week)
- [ ] Monitor error rates
- [ ] Track signup conversion
- [ ] Respond to support requests
- [ ] Gather user feedback
- [ ] Fix critical bugs
- [ ] Optimize based on usage patterns

---

## 💰 Revenue Projections

### Conservative (100 customers in 3 months)
- 70 Free: $0
- 20 Starter ($29): $580/mo
- 8 Pro ($149): $1,192/mo
- 2 Enterprise ($500): $1,000/mo
**Total: $2,772/mo** ($33,264/year)

### Moderate (500 customers in 6 months)
- 350 Free: $0
- 100 Starter: $2,900/mo
- 40 Pro: $5,960/mo
- 10 Enterprise: $5,000/mo
**Total: $13,860/mo** ($166,320/year)

### Optimistic (1,000 customers in 12 months)
- 700 Free: $0
- 200 Starter: $5,800/mo
- 80 Pro: $11,920/mo
- 20 Enterprise: $10,000/mo
**Total: $27,720/mo** ($332,640/year)

---

## 📊 Success Metrics

### Week 1
- Target: 50 signups
- Target: 10 paid subscriptions

### Month 1
- Target: 200 signups
- Target: 30 paid subscriptions
- Target: $1,500 MRR

### Month 3
- Target: 500 signups
- Target: 100 paid subscriptions
- Target: $5,000 MRR

### Month 6
- Target: 1,000 signups
- Target: 200 paid subscriptions
- Target: $10,000 MRR

---

## 🎯 Next Steps

1. **Immediate:** Build `/api` landing page with pricing
2. **This Week:** Build `/dashboard/api` for key management
3. **This Week:** Implement Stripe checkout flow
4. **Next Week:** Add documentation to `/docs`
5. **Next Week:** Build homepage banner
6. **Launch:** Beta test with 10-20 users
7. **Launch:** Public announcement

---

**Estimated Development Time:** 2-3 weeks for complete implementation
**Launch Target:** End of March 2026
