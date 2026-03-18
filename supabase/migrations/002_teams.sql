-- Teams table
create table if not exists teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

-- Link api_keys to teams
alter table api_keys add column if not exists team_id uuid references teams(id);

-- Index for team lookups
create index if not exists idx_api_keys_team on api_keys(team_id);
