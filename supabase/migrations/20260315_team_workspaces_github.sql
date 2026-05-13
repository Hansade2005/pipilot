-- Add GitHub-backed storage columns to team_workspaces
ALTER TABLE team_workspaces
  ADD COLUMN IF NOT EXISTS github_repo_owner TEXT,
  ADD COLUMN IF NOT EXISTS github_repo_name TEXT,
  ADD COLUMN IF NOT EXISTS github_repo_url TEXT,
  ADD COLUMN IF NOT EXISTS github_default_branch TEXT DEFAULT 'main',
  ADD COLUMN IF NOT EXISTS github_last_synced_sha TEXT;

-- Prevent duplicate repo links
ALTER TABLE team_workspaces
  ADD CONSTRAINT unique_github_repo UNIQUE(github_repo_owner, github_repo_name);

-- Index for lookups by repo
CREATE INDEX IF NOT EXISTS idx_team_workspaces_github_repo
  ON team_workspaces(github_repo_owner, github_repo_name);
