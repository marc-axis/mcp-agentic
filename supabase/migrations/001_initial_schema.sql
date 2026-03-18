-- API Keys: admin-managed, one per client
create table if not exists api_keys (
  id            uuid primary key default gen_random_uuid(),
  client_name   text not null,
  key_hash      text not null unique,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Usage Logs: one row per MCP tool call
create table if not exists usage_logs (
  id            uuid primary key default gen_random_uuid(),
  api_key_id    uuid not null references api_keys(id),
  tool_name     text not null,
  feature_slug  text,
  called_at     timestamptz not null default now()
);

-- Features: one row per feature per client (replaces feature-state JSON files)
create table if not exists features (
  id            uuid primary key default gen_random_uuid(),
  api_key_id    uuid not null references api_keys(id),
  feature_slug  text not null,
  state         jsonb not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique(api_key_id, feature_slug)
);

-- Feature Artifacts: Plan.md, Build.md, ToDo.md, run-log.md, lessons-learned.md
create table if not exists feature_artifacts (
  id            uuid primary key default gen_random_uuid(),
  feature_id    uuid not null references features(id),
  artifact_type text not null check (artifact_type in ('plan','build','todo','run_log','lessons_learned')),
  content       text not null default '',
  updated_at    timestamptz not null default now(),
  unique(feature_id, artifact_type)
);

-- Indexes for fast per-client lookups
create index if not exists idx_features_api_key on features(api_key_id);
create index if not exists idx_usage_logs_api_key on usage_logs(api_key_id);
