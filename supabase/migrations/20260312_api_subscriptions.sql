-- PiPilot Search API - Database Schema
-- Run this migration in Supabase SQL Editor

-- ============================================================================
-- 1. API SUBSCRIPTIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS api_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('free', 'starter', 'pro', 'enterprise')),

  -- Stripe integration
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,

  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'trialing')),

  -- Billing period
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  canceled_at TIMESTAMP WITH TIME ZONE,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Unique constraint: one subscription per user
  CONSTRAINT unique_user_subscription UNIQUE (user_id)
);

-- Indexes
CREATE INDEX idx_api_subscriptions_user_id ON api_subscriptions(user_id);
CREATE INDEX idx_api_subscriptions_stripe_customer_id ON api_subscriptions(stripe_customer_id);
CREATE INDEX idx_api_subscriptions_status ON api_subscriptions(status);

-- ============================================================================
-- 2. API KEYS METADATA TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS api_keys_metadata (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Key identification (never store actual key, only hash!)
  key_hash TEXT NOT NULL UNIQUE, -- SHA-256 hash of the actual key
  key_prefix TEXT NOT NULL, -- First 12 chars for display (e.g., "pk_live_abc123...")

  -- Key details
  key_name TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('free', 'starter', 'pro', 'enterprise')),

  -- Status
  revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMP WITH TIME ZONE,

  -- Usage tracking
  last_used_at TIMESTAMP WITH TIME ZONE,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX idx_api_keys_user_id ON api_keys_metadata(user_id);
CREATE INDEX idx_api_keys_hash ON api_keys_metadata(key_hash);
CREATE INDEX idx_api_keys_revoked ON api_keys_metadata(revoked);

-- ============================================================================
-- 3. API USAGE STATS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS api_usage_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Time period
  date DATE NOT NULL,
  hour INTEGER, -- 0-23, NULL for daily aggregates

  -- Usage metrics
  requests_count INTEGER DEFAULT 0,
  cached_requests INTEGER DEFAULT 0,

  -- Endpoint breakdown
  search_requests INTEGER DEFAULT 0,
  extract_requests INTEGER DEFAULT 0,
  smart_search_requests INTEGER DEFAULT 0,

  -- Performance metrics
  avg_response_time_ms INTEGER,
  p95_response_time_ms INTEGER,

  -- Error tracking
  error_count INTEGER DEFAULT 0,
  error_rate DECIMAL(5, 2), -- Percentage

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Unique constraint: one record per user/date/hour
  CONSTRAINT unique_usage_stat UNIQUE (user_id, date, hour)
);

-- Indexes
CREATE INDEX idx_api_usage_user_id ON api_usage_stats(user_id);
CREATE INDEX idx_api_usage_date ON api_usage_stats(date DESC);
CREATE INDEX idx_api_usage_user_date ON api_usage_stats(user_id, date DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS
ALTER TABLE api_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage_stats ENABLE ROW LEVEL SECURITY;

-- Subscriptions: Users can view and update own subscription
CREATE POLICY "Users can view own subscription" ON api_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own subscription" ON api_subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

-- API Keys: Users can manage own keys
CREATE POLICY "Users can view own keys" ON api_keys_metadata
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own keys" ON api_keys_metadata
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own keys" ON api_keys_metadata
  FOR UPDATE USING (auth.uid() = user_id);

-- Usage Stats: Users can view own usage
CREATE POLICY "Users can view own usage" ON api_usage_stats
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_api_subscriptions_updated_at
  BEFORE UPDATE ON api_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_api_usage_updated_at
  BEFORE UPDATE ON api_usage_stats
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Function to create free tier subscription for new users
CREATE OR REPLACE FUNCTION create_free_api_subscription()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO api_subscriptions (user_id, tier, status)
  VALUES (NEW.id, 'free', 'active')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-create free subscription on user signup
CREATE TRIGGER trigger_create_free_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_free_api_subscription();

-- ============================================================================
-- GRANTS
-- ============================================================================

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON api_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON api_keys_metadata TO authenticated;
GRANT SELECT ON api_usage_stats TO authenticated;

-- Service role needs full access
GRANT ALL ON api_subscriptions TO service_role;
GRANT ALL ON api_keys_metadata TO service_role;
GRANT ALL ON api_usage_stats TO service_role;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE api_subscriptions IS 'User API subscriptions and billing information';
COMMENT ON TABLE api_keys_metadata IS 'API key metadata (never stores actual keys)';
COMMENT ON TABLE api_usage_stats IS 'Aggregated API usage statistics for analytics';

COMMENT ON COLUMN api_keys_metadata.key_hash IS 'SHA-256 hash of the actual API key (for validation without storing plaintext)';
COMMENT ON COLUMN api_keys_metadata.key_prefix IS 'First 12 characters of the key for display purposes only';
