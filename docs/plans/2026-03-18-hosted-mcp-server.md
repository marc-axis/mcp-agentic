# AAFM Hosted MCP Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform AAFM from a local stdio MCP server into a hosted remote MCP server that clients connect to using only a URL and API key from any IDE.

**Architecture:** Express HTTP server supporting both SSE (Cursor/VS Code) and Streamable HTTP (Claude Code) transports. All feature state stored in Supabase. API keys managed in Supabase with per-call usage logging. Deploy to Railway via GitHub push.

**Tech Stack:** Node.js 18+, Express 4, `@modelcontextprotocol/sdk` (latest), `@supabase/supabase-js` v2, Railway (deploy), Supabase (Postgres)

**Design doc:** `docs/plans/2026-03-18-hosted-mcp-server-design.md`

---

## Key Changes From Local Server

The existing `aafm-mcp/nodejs/aafm-server.js` (1,243 lines, ES modules) is the source. This plan creates a new `server/` package at the repo root that replaces it for hosted use. Changes:

1. `StdioServerTransport` → Express with `/mcp` (Streamable HTTP) + `/sse` endpoints
2. All `fs.readFile`/`fs.writeFile` on feature state → Supabase queries
3. Artifacts (Plan.md, Build.md, etc.) → `feature_artifacts` table instead of local files
4. `user_story_path` param → `user_story` (text content passed directly, no local file path)
5. `target_repo_path` kept as metadata only — no longer used for file I/O
6. GitHub token passed as param to `start_feature`, stored in feature state jsonb
7. API key header required on every request
8. Prompts still read from disk at `../aafm-mcp/prompts/` (same server)

---

## Task 1: Initialize the `server/` package

**Files:**
- Create: `server/package.json`
- Create: `server/.env.example`
- Create: `server/.gitignore`

**Step 1: Create the server directory and package.json**

```bash
mkdir -p /Users/mlubout/Documents/GitHub/mcp-agentic/server
```

Create `server/package.json`:
```json
{
  "name": "aafm-hosted-server",
  "version": "2.0.0",
  "description": "AAFM Hosted MCP Server — remote HTTP transport",
  "type": "module",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js",
    "test": "node --test"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.10.0",
    "@supabase/supabase-js": "^2.49.0",
    "express": "^4.21.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

**Step 2: Create `.env.example`**

Create `server/.env.example`:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
PORT=3000
```

**Step 3: Create `.gitignore`**

Create `server/.gitignore`:
```
node_modules/
.env
```

**Step 4: Install dependencies**

```bash
cd server && npm install
```

Expected: `node_modules/` created with express, supabase client, mcp sdk.

**Step 5: Initialize git at repo root and commit**

```bash
cd /Users/mlubout/Documents/GitHub/mcp-agentic
git init
git add server/package.json server/.env.example server/.gitignore docs/
git commit -m "feat: initialize hosted server package and design docs"
```

---

## Task 2: Supabase schema

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

**Step 1: Write the migration SQL**

Create `supabase/migrations/001_initial_schema.sql`:
```sql
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

-- Index for fast per-client feature lookups
create index if not exists idx_features_api_key on features(api_key_id);
create index if not exists idx_usage_logs_api_key on usage_logs(api_key_id);
```

**Step 2: Apply the migration via Supabase MCP**

Use the `mcp__supabase__apply_migration` tool with:
- `name`: `initial_schema`
- `query`: (contents of the SQL above)

**Step 3: Verify tables exist**

Use `mcp__supabase__list_tables` to confirm all 4 tables appear.

**Step 4: Commit**

```bash
git add supabase/
git commit -m "feat: add Supabase schema migration for hosted server"
```

---

## Task 3: Supabase client and state layer

**Files:**
- Create: `server/db/supabase.js`

This module replaces all `fs.readFile`/`fs.writeFile` calls from the original server. Every function mirrors one from the original server.

**Step 1: Create `server/db/supabase.js`**

```javascript
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export function hashKey(key) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

// Validate API key and return { id, client_name } or null
export async function validateApiKey(rawKey) {
  const hash = hashKey(rawKey);
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, client_name")
    .eq("key_hash", hash)
    .eq("is_active", true)
    .single();
  if (error || !data) return null;
  return data;
}

// Log a tool call
export async function logUsage(apiKeyId, toolName, featureSlug = null) {
  await supabase.from("usage_logs").insert({
    api_key_id: apiKeyId,
    tool_name: toolName,
    feature_slug: featureSlug ?? null,
  });
}

// Load feature state — throws if not found
export async function loadFeature(apiKeyId, slug) {
  const { data, error } = await supabase
    .from("features")
    .select("id, state")
    .eq("api_key_id", apiKeyId)
    .eq("feature_slug", slug)
    .single();
  if (error || !data) throw new Error(`Feature '${slug}' not found.`);
  return { id: data.id, ...data.state };
}

// Save (upsert) feature state
export async function saveFeature(apiKeyId, slug, state) {
  const { error } = await supabase.from("features").upsert(
    {
      api_key_id: apiKeyId,
      feature_slug: slug,
      state,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "api_key_id,feature_slug" }
  );
  if (error) throw new Error(`Failed to save feature '${slug}': ${error.message}`);
}

// Append text to run-log artifact
export async function appendRunLog(apiKeyId, slug, text) {
  const featureId = await getFeatureId(apiKeyId, slug);
  const existing = await getArtifact(featureId, "run_log");
  await upsertArtifact(featureId, "run_log", (existing ?? "") + text);
}

// Get full run log content
export async function getRunLog(apiKeyId, slug) {
  const featureId = await getFeatureId(apiKeyId, slug);
  return await getArtifact(featureId, "run_log") ?? "";
}

// Save a named artifact (plan, build, todo, lessons_learned)
export async function saveArtifact(apiKeyId, slug, artifactType, content) {
  const featureId = await getFeatureId(apiKeyId, slug);
  await upsertArtifact(featureId, artifactType, content);
}

// Get artifact content by type
export async function getArtifactBySlug(apiKeyId, slug, artifactType) {
  const featureId = await getFeatureId(apiKeyId, slug);
  return await getArtifact(featureId, artifactType) ?? "";
}

// Internal helpers
async function getFeatureId(apiKeyId, slug) {
  const { data, error } = await supabase
    .from("features")
    .select("id")
    .eq("api_key_id", apiKeyId)
    .eq("feature_slug", slug)
    .single();
  if (error || !data) throw new Error(`Feature '${slug}' not found.`);
  return data.id;
}

async function getArtifact(featureId, artifactType) {
  const { data } = await supabase
    .from("feature_artifacts")
    .select("content")
    .eq("feature_id", featureId)
    .eq("artifact_type", artifactType)
    .single();
  return data?.content ?? null;
}

async function upsertArtifact(featureId, artifactType, content) {
  const { error } = await supabase.from("feature_artifacts").upsert(
    { feature_id: featureId, artifact_type: artifactType, content, updated_at: new Date().toISOString() },
    { onConflict: "feature_id,artifact_type" }
  );
  if (error) throw new Error(`Failed to save artifact '${artifactType}': ${error.message}`);
}
```

**Step 2: Write a quick smoke test**

Create `server/db/supabase.test.js`:
```javascript
import { strictEqual, ok } from "node:assert";
import { test } from "node:test";
import { hashKey } from "./supabase.js";

test("hashKey returns consistent sha256 hex", () => {
  const a = hashKey("test-key-123");
  const b = hashKey("test-key-123");
  strictEqual(a, b);
  strictEqual(a.length, 64);
});

test("hashKey returns different values for different keys", () => {
  const a = hashKey("key-one");
  const b = hashKey("key-two");
  ok(a !== b);
});
```

**Step 3: Run the test**

```bash
cd server && node --test db/supabase.test.js
```

Expected: 2 passing tests.

**Step 4: Commit**

```bash
git add server/db/
git commit -m "feat: add Supabase state layer (replaces fs file I/O)"
```

---

## Task 4: API key middleware

**Files:**
- Create: `server/middleware/auth.js`
- Create: `server/middleware/auth.test.js`

**Step 1: Write the failing test**

Create `server/middleware/auth.test.js`:
```javascript
import { strictEqual } from "node:assert";
import { test, mock } from "node:test";

// We'll test the key extraction logic directly (pure function)
import { extractBearerToken } from "./auth.js";

test("extractBearerToken returns key from Authorization header", () => {
  const req = { headers: { authorization: "Bearer my-secret-key" } };
  strictEqual(extractBearerToken(req), "my-secret-key");
});

test("extractBearerToken returns null when header missing", () => {
  const req = { headers: {} };
  strictEqual(extractBearerToken(req), null);
});

test("extractBearerToken returns null for non-Bearer scheme", () => {
  const req = { headers: { authorization: "Basic abc123" } };
  strictEqual(extractBearerToken(req), null);
});
```

**Step 2: Run test — expect failure**

```bash
cd server && node --test middleware/auth.test.js
```

Expected: FAIL — `extractBearerToken` not defined.

**Step 3: Create `server/middleware/auth.js`**

```javascript
import { validateApiKey, logUsage } from "../db/supabase.js";

export function extractBearerToken(req) {
  const auth = req.headers["authorization"] ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim() || null;
}

// Express middleware: validate API key, attach apiKeyId to req
export async function requireApiKey(req, res, next) {
  const rawKey = extractBearerToken(req);
  if (!rawKey) {
    return res.status(401).json({ error: "Missing API key. Provide: Authorization: Bearer <key>" });
  }

  const keyData = await validateApiKey(rawKey);
  if (!keyData) {
    return res.status(401).json({ error: "Invalid or revoked API key." });
  }

  req.apiKeyId = keyData.id;
  req.clientName = keyData.client_name;
  next();
}

// Call after tool execution to log usage
export async function trackUsage(apiKeyId, toolName, featureSlug = null) {
  // Fire and forget — never block tool response
  logUsage(apiKeyId, toolName, featureSlug).catch(() => {});
}
```

**Step 4: Run test — expect pass**

```bash
cd server && node --test middleware/auth.test.js
```

Expected: 3 passing tests.

**Step 5: Commit**

```bash
git add server/middleware/
git commit -m "feat: add API key auth middleware with usage tracking"
```

---

## Task 5: Port MCP tool handlers to Supabase

**Files:**
- Create: `server/mcp/tools.js`

This is the largest task. Copy all 15 tool definitions from `aafm-mcp/nodejs/aafm-server.js` and update every `fs.*` call to use the Supabase state layer.

**Important param changes in `start_feature`:**
- Remove `user_story_path` (was local file path) → add `user_story` (text content directly)
- Keep `target_repo_path` as optional metadata stored in state only
- Add `github_token` optional param (stored in state for PR creation)

**Step 1: Create `server/mcp/tools.js`**

Copy from `aafm-mcp/nodejs/aafm-server.js` lines 291–1230 (all tool definitions and handlers). Then make these targeted substitutions:

**A. Add imports at top of file:**
```javascript
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  loadFeature, saveFeature, appendRunLog, getRunLog,
  saveArtifact, getArtifactBySlug
} from "../db/supabase.js";
import { trackUsage } from "../middleware/auth.js";

const __filename = fileURLToPath(import.meta.url);
const SERVER_DIR = path.dirname(__filename);
const PROMPTS_DIR = path.resolve(SERVER_DIR, "../../aafm-mcp/prompts");
```

**B. Replace `loadFeature(slug)` → `loadFeature(apiKeyId, slug)`**
Every tool handler receives `apiKeyId` from the request context. Pass it through.

**C. Replace `saveFeature(slug, data)` → `saveFeature(apiKeyId, slug, data)`**

**D. Replace `appendRunLog(slug, targetRepoPath, text)` → `appendRunLog(apiKeyId, slug, text)`**
The `targetRepoPath` param is no longer needed for log writing.

**E. Replace artifact file writes:**
```javascript
// Before:
fs.writeFileSync(path.join(featureDir(slug, targetRepoPath), "Plan.md"), content)
// After:
await saveArtifact(apiKeyId, slug, "plan", content)
```

**F. Replace artifact file reads:**
```javascript
// Before:
fs.readFileSync(path.join(featureDir(slug, targetRepoPath), "Plan.md"), "utf-8")
// After:
await getArtifactBySlug(apiKeyId, slug, "plan")
```

**G. Update `start_feature` tool definition — change `user_story_path` to `user_story`:**
```javascript
// In the tool's inputSchema properties:
user_story: {
  type: "string",
  description: "The full text content of the user story. Paste the entire user story here."
},
// Remove user_story_path property
// Add github_token:
github_token: {
  type: "string",
  description: "Optional GitHub personal access token for PR creation and log pushing."
}
```

**H. Update `start_feature` handler — use `user_story` directly instead of reading from file:**
```javascript
// Before:
const user_story = fs.readFileSync(user_story_path, "utf-8").trim();
// After:
const user_story = args.user_story?.trim();
if (!user_story) throw new Error("user_story is required");
```

**I. Update `check_user_story` similarly — accept `user_story` text not a path**

**J. Export the tools array and call handler:**
```javascript
export { TOOLS, handleToolCall };
```

Where `TOOLS` is the array of tool definitions and `handleToolCall(toolName, args, apiKeyId)` is the dispatcher.

**Step 2: Verify the file compiles**

```bash
cd server && node --input-type=module --eval "import './mcp/tools.js'; console.log('ok')"
```

Expected: `ok` (no import errors)

**Step 3: Commit**

```bash
git add server/mcp/
git commit -m "feat: port all 15 MCP tool handlers to Supabase state layer"
```

---

## Task 6: Express server with dual transports

**Files:**
- Create: `server/index.js`

This wires everything together: Express app, auth middleware, both MCP transports.

**Step 1: Create `server/index.js`**

```javascript
import "dotenv/config";
import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { requireApiKey, trackUsage } from "./middleware/auth.js";
import { TOOLS, handleToolCall } from "./mcp/tools.js";

const app = express();
app.use(express.json());

// Health check (Railway uses this)
app.get("/health", (_req, res) => res.json({ status: "ok" }));

// ── Streamable HTTP transport (Claude Code and newer clients) ─────────────
app.post("/mcp", requireApiKey, async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const mcpServer = buildMcpServer(req.apiKeyId);
  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, req.body);
  res.on("finish", () => mcpServer.close().catch(() => {}));
});

// Handle GET/DELETE for Streamable HTTP (SSE streams within session)
app.get("/mcp", requireApiKey, async (req, res) => {
  res.status(405).json({ error: "Use POST /mcp for Streamable HTTP" });
});

// ── SSE transport (Cursor, VS Code, older clients) ────────────────────────
const sseSessions = new Map();

app.get("/sse", requireApiKey, async (req, res) => {
  const transport = new SSEServerTransport("/sse/message", res);
  const mcpServer = buildMcpServer(req.apiKeyId);
  sseSessions.set(transport.sessionId, { transport, mcpServer });
  res.on("close", () => {
    sseSessions.delete(transport.sessionId);
    mcpServer.close().catch(() => {});
  });
  await mcpServer.connect(transport);
});

app.post("/sse/message", requireApiKey, async (req, res) => {
  const sessionId = req.query.sessionId;
  const session = sseSessions.get(sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });
  await session.transport.handlePostMessage(req, res, req.body);
});

// ── MCP server factory ────────────────────────────────────────────────────
function buildMcpServer(apiKeyId) {
  const server = new Server(
    { name: "AAFM Hosted", version: "2.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    trackUsage(apiKeyId, name, args?.feature_slug ?? args?.slug ?? null);
    try {
      return await handleToolCall(name, args, apiKeyId);
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  });

  return server;
}

// ── Start ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => console.log(`AAFM hosted server running on port ${PORT}`));
```

**Step 2: Verify it starts (need env vars set)**

Create `server/.env` (local dev only, gitignored):
```
SUPABASE_URL=<your-supabase-url>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
PORT=3000
```

```bash
cd server && node index.js
```

Expected: `AAFM hosted server running on port 3000`

**Step 3: Test the health endpoint**

```bash
curl http://localhost:3000/health
```

Expected: `{"status":"ok"}`

**Step 4: Test auth rejection**

```bash
curl -X POST http://localhost:3000/mcp -H "Content-Type: application/json" -d '{}'
```

Expected: `{"error":"Missing API key..."}`

**Step 5: Commit**

```bash
git add server/index.js server/.env.example
git commit -m "feat: add Express server with SSE and Streamable HTTP transports"
```

---

## Task 7: Railway deployment config

**Files:**
- Create: `railway.json`
- Create: `.env.example`

**Step 1: Create `railway.json` at repo root**

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "nixpacks"
  },
  "deploy": {
    "startCommand": "cd server && node index.js",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30
  }
}
```

**Step 2: Create root `.env.example`**

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
PORT=3000
```

**Step 3: Update root `.gitignore` to exclude .env files**

Create `/Users/mlubout/Documents/GitHub/mcp-agentic/.gitignore`:
```
node_modules/
.env
server/.env
*.lnk
*_Error.txt
__aafm-mcp/
___All_Errors.txt
```

**Step 4: Commit**

```bash
git add railway.json .env.example .gitignore
git commit -m "feat: add Railway deployment config"
```

**Step 5: Deploy to Railway**

- Go to railway.app → New Project → Deploy from GitHub repo → select `mcp-agentic`
- Add environment variables in Railway dashboard:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Railway will auto-build and deploy
- Note the public URL (e.g. `https://mcp-agentic-production.up.railway.app`)

---

## Task 8: Create first API key and verify end-to-end

**Step 1: Create a test API key in Supabase**

Generate a random key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Hash it and insert via Supabase SQL editor:
```sql
insert into api_keys (client_name, key_hash)
values ('Test Client', encode(sha256('YOUR_RANDOM_KEY_HERE'::bytea), 'hex'));
```

Or use the `mcp__supabase__execute_sql` tool.

**Step 2: Test Claude Code connection**

Add to `~/.claude.json` mcpServers:
```json
{
  "aafm": {
    "type": "http",
    "url": "https://your-app.railway.app/mcp",
    "headers": {
      "Authorization": "Bearer YOUR_RANDOM_KEY_HERE"
    }
  }
}
```

**Step 3: Verify tools are listed**

In Claude Code, run: `/mcp` — should show 15 AAFM tools listed.

**Step 4: Test SSE connection (Cursor config)**

```json
{
  "mcpServers": {
    "aafm": {
      "url": "https://your-app.railway.app/sse",
      "headers": {
        "Authorization": "Bearer YOUR_RANDOM_KEY_HERE"
      }
    }
  }
}
```

**Step 5: Run a real feature through the pipeline**

Call `start_feature` with:
- `feature_name`: "Test Hosted Feature"
- `user_story`: "As a user, I want to test the hosted server so that I can verify it works."
- `feature_overview`: "Smoke test of the hosted AAFM server"

Verify: feature appears in Supabase `features` table with correct state.

**Step 6: Verify usage logging**

```sql
select * from usage_logs order by called_at desc limit 10;
```

Expected: rows for `start_feature` and any other tool calls made.

**Step 7: Commit any fixes found during testing**

```bash
git add -A
git commit -m "fix: resolve any issues found during end-to-end testing"
```

---

## Client Setup Instructions (to send to clients)

Once deployed, send each client:

1. Their API key (generated as above)
2. These config snippets:

**Claude Code** — add to `~/.claude.json`:
```json
{
  "mcpServers": {
    "aafm": {
      "type": "http",
      "url": "https://YOUR_RAILWAY_URL/mcp",
      "headers": { "Authorization": "Bearer THEIR_API_KEY" }
    }
  }
}
```

**Cursor** — add to MCP settings:
```json
{
  "mcpServers": {
    "aafm": {
      "url": "https://YOUR_RAILWAY_URL/sse",
      "headers": { "Authorization": "Bearer THEIR_API_KEY" }
    }
  }
}
```

**VS Code** — same as Cursor format.

---

## Notes

- **Prompt files**: The hosted server still reads prompt templates from `aafm-mcp/prompts/` on disk. These are bundled with the deployed server. To update prompts, push to GitHub and Railway auto-redeploys.
- **GitHub integration**: Each client passes their own `github_token` via `start_feature`. It's stored in the feature state jsonb and used for `create_pr` and `push_run_log`.
- **Revoking a client**: Set `is_active = false` in `api_keys` table — takes effect immediately on next request.
- **Usage dashboard**: Query `usage_logs` grouped by `api_key_id` and `tool_name` for per-client analytics.
