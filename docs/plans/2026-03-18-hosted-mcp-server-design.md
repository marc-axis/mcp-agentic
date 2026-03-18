# Design: AAFM Hosted MCP Server
**Date:** 2026-03-18
**Status:** Approved

## Problem

AAFM currently runs as a local stdio MCP server — each developer installs it on their own machine. The goal is to host it centrally so clients can connect from any IDE with just a URL and API key, with no local install required.

## Goal

Transform AAFM from a local stdio MCP server into a hosted remote MCP server that:
- Is IDE-agnostic (Claude Code, Cursor, VS Code)
- Requires zero client-side install
- Tracks usage per client via API keys
- Stores all feature state in Supabase

---

## Architecture

```
Client IDE (Cursor / Claude Code / VS Code)
        │
        │  HTTP + API key header
        ▼
┌─────────────────────────────────────────┐
│           Express HTTP Server            │
│                                          │
│  POST /mcp  → Streamable HTTP transport │
│  GET  /sse  → SSE transport             │
│                                          │
│  Middleware:                             │
│    1. Extract API key from header        │
│    2. Validate key + log usage           │
│    3. Inject user_id into request        │
│                                          │
│  MCP Tool Logic (existing 15 tools)      │
│    - All state ops → Supabase            │
│    - All state scoped by user_id         │
└─────────────────┬───────────────────────┘
                  │
                  ▼
         ┌────────────────┐
         │    Supabase     │
         │                │
         │  api_keys       │
         │  usage_logs     │
         │  features       │
         │  feature_artifacts│
         └────────────────┘

Deployed on Railway (auto-deploy from GitHub)
```

**What stays the same:** All 15 tools, all phase logic, all gate governance, all prompt templates.

**What changes:** Transport (stdio → HTTP), state storage (files → Supabase), auth middleware added, multi-tenancy via `api_key_id` scoping.

---

## Supabase Schema

### `api_keys`
Admin-managed. One row per client.
```sql
id            uuid  primary key  default gen_random_uuid()
client_name   text  not null
key_hash      text  not null unique  -- sha256 of the actual key, never store plaintext
is_active     bool  not null default true
created_at    timestamptz default now()
```

### `usage_logs`
One row per tool call — enables per-client usage tracking.
```sql
id            uuid  primary key  default gen_random_uuid()
api_key_id    uuid  not null references api_keys(id)
tool_name     text  not null
feature_slug  text
called_at     timestamptz default now()
```

### `features`
One row per feature per client. Replaces `feature-state/<slug>/feature.json`.
```sql
id            uuid  primary key  default gen_random_uuid()
api_key_id    uuid  not null references api_keys(id)
feature_slug  text  not null
state         jsonb not null  -- full feature.json blob, preserves existing structure
created_at    timestamptz default now()
updated_at    timestamptz default now()
unique(api_key_id, feature_slug)
```

### `feature_artifacts`
Stores Plan.md, Build.md, ToDo.md, run-log.md, Lessons-Learned.md per feature.
```sql
id            uuid  primary key  default gen_random_uuid()
feature_id    uuid  not null references features(id)
artifact_type text  not null  -- "plan" | "build" | "todo" | "run_log" | "lessons_learned"
content       text  not null
updated_at    timestamptz default now()
unique(feature_id, artifact_type)
```

**Key decisions:**
- Keys stored hashed (sha256) — plaintext shown only once at creation time
- `state jsonb` preserves existing feature.json structure exactly — minimal code changes required
- Artifacts stored as text blobs — simple, queryable, no file system dependency

---

## Client Configuration

Clients receive a URL and API key. No install required.

### Claude Code (`~/.claude.json` or project `.mcp.json`)
```json
{
  "mcpServers": {
    "aafm": {
      "type": "http",
      "url": "https://your-app.railway.app/mcp",
      "headers": {
        "Authorization": "Bearer <api-key>"
      }
    }
  }
}
```

### Cursor / VS Code (SSE transport)
```json
{
  "mcpServers": {
    "aafm": {
      "url": "https://your-app.railway.app/sse",
      "headers": {
        "Authorization": "Bearer <api-key>"
      }
    }
  }
}
```

The server detects which transport is used based on which endpoint is hit. The same API key works on both.

**Admin key management:** Keys are added/revoked directly in Supabase. No admin UI required initially.

---

## Code Changes

### 1. Transport layer
Replace stdio bootstrap with Express serving both transports:
- `POST /mcp` → Streamable HTTP (MCP SDK `StreamableHTTPServerTransport`)
- `GET /sse` → SSE (MCP SDK `SSEServerTransport`)
- `GET /health` → 200 OK (Railway healthcheck)
- API key middleware on all MCP routes

### 2. State reads/writes
~20 functions that do `fs.readFile` / `fs.writeFile` on feature JSON become Supabase queries:
```
readFeatureState(slug)         → SELECT state FROM features WHERE api_key_id=? AND feature_slug=?
writeFeatureState(slug, state) → UPSERT INTO features (api_key_id, feature_slug, state)
```

### 3. Artifact saves
Plan.md, Build.md etc currently write to `${targetRepoPath}/.aafm/${slug}/`. Instead:
```
UPSERT INTO feature_artifacts (feature_id, artifact_type, content)
```

### 4. API key middleware
Extracts key from `Authorization: Bearer <key>` header, hashes it, looks up `api_key_id` in Supabase, rejects with 401 if not found or inactive. Injects `api_key_id` into request context for all tool handlers.

### 5. Usage logging
After each successful tool call, insert a row into `usage_logs`.

### 6. GitHub integration
Unchanged. Client provides their own GitHub token via `start_feature` params — stored in feature `state` jsonb in Supabase.

### What does NOT change
- All 15 tool definitions and descriptions
- All phase/gate logic
- All prompt templates (preflight, P41-P44)
- All governance rules (MCP-AI-Rules.md)
- All checklists

---

## New Dependencies

```json
{
  "express": "^4.x",
  "@supabase/supabase-js": "^2.x"
}
```

MCP SDK already supports both HTTP transports — no new MCP dependency needed.

---

## Deployment

**Platform:** Railway (auto-deploy from GitHub push)

**Repo structure additions:**
```
mcp-agentic/
├── railway.json          ← new
├── .env.example          ← new
└── aafm-mcp/
    └── nodejs/
        ├── aafm-server.js  ← modified
        └── package.json    ← add express, @supabase/supabase-js
```

**`railway.json`:**
```json
{
  "build": { "builder": "nixpacks" },
  "deploy": {
    "startCommand": "node aafm-mcp/nodejs/aafm-server.js",
    "healthcheckPath": "/health"
  }
}
```

**Environment variables (set in Railway dashboard):**
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
PORT=3000  (set automatically by Railway)
```

---

## Approach

**Option A: Lift & Shift** — selected

Keep all existing tool logic, swap transport and storage layer only. Preserves the carefully tuned governance logic and prompt templates. Minimal rewrite risk.

---

## Success Criteria

- A client with only a URL + API key can connect from Claude Code, Cursor, and VS Code
- All 15 tools work identically to the local version
- Feature state persists across sessions (Supabase)
- Every tool call is logged against the client's API key
- Admin can add/revoke keys in Supabase and changes take effect immediately
- Deploys to Railway from a GitHub push
