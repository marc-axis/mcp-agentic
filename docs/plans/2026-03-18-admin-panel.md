# Admin Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a server-rendered admin panel at `/admin` on the existing Railway Express server for managing teams, users (API keys), and viewing usage analytics.

**Architecture:** Express router mounted at `/admin`, server-rendered HTML via template literals, `cookie-session` for password auth, Supabase for all data. Two new DB migrations add `teams` table and `team_id` FK on `api_keys`. All admin pages use Tailwind CDN + Lucide CDN — no build step.

**Tech Stack:** Express 4, `cookie-session`, `@supabase/supabase-js` (already installed), Tailwind CSS CDN, Lucide icons CDN, Fira Code + Fira Sans (Google Fonts CDN)

**Design doc:** `docs/plans/2026-03-18-admin-panel-design.md`

---

## Key Facts

- **Working directory:** `/Users/mlubout/Documents/GitHub/mcp-agentic`
- **Server package:** `server/` (ES modules, `"type": "module"`)
- **Supabase project:** `xnxqtiykasatyzplbzjd`
- **Existing tables:** `api_keys`, `usage_logs`, `features`, `feature_artifacts`
- **New env var needed:** `ADMIN_PASSWORD` (set in Railway dashboard)
- **Colors:** Primary `#2563EB`, BG `#F8FAFC`, Text `#1E293B`, Accent `#F97316`

---

## Task 1: Install cookie-session and add DB migrations

**Files:**
- Modify: `server/package.json`
- Create: `supabase/migrations/002_teams.sql`

**Step 1: Install cookie-session**

```bash
cd /Users/mlubout/Documents/GitHub/mcp-agentic/server && npm install cookie-session
```

Expected: `cookie-session` appears in `node_modules/`.

**Step 2: Create `supabase/migrations/002_teams.sql`**

```sql
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
```

**Step 3: Apply migration via Supabase MCP**

Use `mcp__supabase__apply_migration` with:
- `project_id`: `xnxqtiykasatyzplbzjd`
- `name`: `teams`
- `query`: contents of the SQL above

**Step 4: Verify via Supabase MCP**

Use `mcp__supabase__list_tables` to confirm `teams` table exists and `api_keys` now has `team_id`.

**Step 5: Commit**

```bash
cd /Users/mlubout/Documents/GitHub/mcp-agentic
git add supabase/migrations/002_teams.sql server/package.json server/package-lock.json
git commit -m "feat: add teams table and cookie-session dependency"
```

---

## Task 2: Shared layout and admin queries

**Files:**
- Create: `server/admin/layout.js`
- Create: `server/admin/queries.js`

**Step 1: Create `server/admin/layout.js`**

This exports a single `html(title, body, { active })` function that wraps pages in the shared shell.

```javascript
export function html(title, bodyContent, { active = "dashboard" } = {}) {
  const navItem = (href, label, icon, key) => `
    <a href="${href}" class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      active === key
        ? "bg-blue-600 text-white"
        : "text-slate-600 hover:bg-slate-100"
    }">
      <i data-lucide="${icon}" class="w-4 h-4"></i>${label}
    </a>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — AAFM Admin</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&family=Fira+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
  <style>
    body { font-family: 'Fira Sans', sans-serif; background: #F8FAFC; color: #1E293B; }
    h1,h2,h3,.mono { font-family: 'Fira Code', monospace; }
  </style>
</head>
<body class="min-h-screen flex">
  <!-- Sidebar -->
  <aside class="w-56 min-h-screen bg-white border-r border-slate-200 flex flex-col p-4 gap-1 fixed">
    <div class="px-3 py-3 mb-4">
      <span class="mono text-sm font-semibold text-blue-600">AAFM Admin</span>
    </div>
    ${navItem("/admin", "Dashboard", "layout-dashboard", "dashboard")}
    ${navItem("/admin/teams", "Teams", "users", "teams")}
    <div class="mt-auto">
      <form method="POST" action="/admin/logout">
        <button type="submit" class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-100 w-full transition-colors">
          <i data-lucide="log-out" class="w-4 h-4"></i>Logout
        </button>
      </form>
    </div>
  </aside>
  <!-- Main content -->
  <main class="ml-56 flex-1 p-8 min-h-screen">
    <h1 class="text-xl font-semibold mb-6">${title}</h1>
    ${bodyContent}
  </main>
  <script>lucide.createIcons();</script>
</body>
</html>`;
}
```

**Step 2: Create `server/admin/queries.js`**

```javascript
import { createClient } from "@supabase/supabase-js";

function db() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function getKpis() {
  const supabase = db();
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 864e5).toISOString();

  const [teams, users, callsToday, callsWeek] = await Promise.all([
    supabase.from("teams").select("id", { count: "exact", head: true }),
    supabase.from("api_keys").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("usage_logs").select("id", { count: "exact", head: true }).gte("called_at", startOfDay),
    supabase.from("usage_logs").select("id", { count: "exact", head: true }).gte("called_at", sevenDaysAgo),
  ]);

  return {
    teams: teams.count ?? 0,
    users: users.count ?? 0,
    callsToday: callsToday.count ?? 0,
    callsWeek: callsWeek.count ?? 0,
  };
}

export async function getRecentActivity(limit = 50) {
  const supabase = db();
  const { data } = await supabase
    .from("usage_logs")
    .select("id, tool_name, called_at, feature_slug, api_key_id, api_keys(client_name, team_id, teams(name))")
    .order("called_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getTeams() {
  const supabase = db();
  const sevenDaysAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const { data: teams } = await supabase.from("teams").select("id, name, created_at").order("name");
  if (!teams) return [];

  return Promise.all(
    teams.map(async (team) => {
      const [users, calls] = await Promise.all([
        supabase.from("api_keys").select("id", { count: "exact", head: true }).eq("team_id", team.id).eq("is_active", true),
        supabase.from("usage_logs")
          .select("id", { count: "exact", head: true })
          .gte("called_at", sevenDaysAgo)
          .in("api_key_id",
            (await supabase.from("api_keys").select("id").eq("team_id", team.id)).data?.map(k => k.id) ?? []
          ),
      ]);
      return { ...team, userCount: users.count ?? 0, callsWeek: calls.count ?? 0 };
    })
  );
}

export async function getTeam(teamId) {
  const supabase = db();
  const { data: team } = await supabase.from("teams").select("id, name").eq("id", teamId).single();
  if (!team) return null;

  const sevenDaysAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const { data: users } = await supabase
    .from("api_keys")
    .select("id, client_name, is_active, created_at")
    .eq("team_id", teamId)
    .order("client_name");

  const usersWithStats = await Promise.all(
    (users ?? []).map(async (u) => {
      const [calls, lastActive] = await Promise.all([
        supabase.from("usage_logs").select("id", { count: "exact", head: true }).eq("api_key_id", u.id).gte("called_at", sevenDaysAgo),
        supabase.from("usage_logs").select("called_at").eq("api_key_id", u.id).order("called_at", { ascending: false }).limit(1),
      ]);
      return {
        ...u,
        callsWeek: calls.count ?? 0,
        lastActive: lastActive.data?.[0]?.called_at ?? null,
      };
    })
  );

  return { ...team, users: usersWithStats };
}

export async function createTeam(name) {
  const { data, error } = await db().from("teams").insert({ name }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function createUser(clientName, teamId, keyHash) {
  const { error } = await db().from("api_keys").insert({
    client_name: clientName,
    key_hash: keyHash,
    team_id: teamId || null,
  });
  if (error) throw new Error(error.message);
}

export async function revokeUser(apiKeyId) {
  const { error } = await db().from("api_keys").update({ is_active: false }).eq("id", apiKeyId);
  if (error) throw new Error(error.message);
}

export async function getTeamList() {
  const { data } = await db().from("teams").select("id, name").order("name");
  return data ?? [];
}
```

**Step 3: Verify both files compile**

```bash
cd /Users/mlubout/Documents/GitHub/mcp-agentic/server && node --input-type=module --eval "import './admin/layout.js'; import './admin/queries.js'; console.log('ok')"
```

Expected: `ok`

**Step 4: Commit**

```bash
git add server/admin/
git commit -m "feat: add admin layout shell and Supabase query helpers"
```

---

## Task 3: Auth middleware and login page

**Files:**
- Create: `server/admin/auth.js`
- Create: `server/admin/pages/login.js`

**Step 1: Create `server/admin/auth.js`**

```javascript
import cookieSession from "cookie-session";

export const sessionMiddleware = cookieSession({
  name: "aafm_admin",
  secret: process.env.ADMIN_PASSWORD ?? "dev-secret",
  maxAge: 8 * 60 * 60 * 1000, // 8 hours
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
});

export function requireAdmin(req, res, next) {
  if (req.session?.admin === true) return next();
  res.redirect("/admin/login");
}
```

**Step 2: Create `server/admin/pages/login.js`**

```javascript
export function loginPage(error = "") {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Login — AAFM</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@500;600&family=Fira+Sans:wght@400;500&display=swap" rel="stylesheet">
  <style>body { font-family: 'Fira Sans', sans-serif; background: #F8FAFC; }</style>
</head>
<body class="min-h-screen flex items-center justify-center">
  <div class="bg-white border border-slate-200 rounded-xl p-8 w-full max-w-sm shadow-sm">
    <h1 class="text-xl font-semibold text-slate-900 mb-1" style="font-family:'Fira Code',monospace">AAFM Admin</h1>
    <p class="text-sm text-slate-500 mb-6">Sign in to manage teams and users</p>
    ${error ? `<div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">${error}</div>` : ""}
    <form method="POST" action="/admin/login" class="flex flex-col gap-4">
      <div>
        <label for="password" class="block text-sm font-medium text-slate-700 mb-1">Password</label>
        <input
          type="password"
          id="password"
          name="password"
          required
          autofocus
          class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Enter admin password"
        >
      </div>
      <button
        type="submit"
        class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg text-sm transition-colors cursor-pointer"
      >
        Sign in
      </button>
    </form>
  </div>
</body>
</html>`;
}
```

**Step 3: Verify files compile**

```bash
cd /Users/mlubout/Documents/GitHub/mcp-agentic/server && node --input-type=module --eval "import './admin/auth.js'; import './admin/pages/login.js'; console.log('ok')"
```

Expected: `ok`

**Step 4: Commit**

```bash
git add server/admin/auth.js server/admin/pages/login.js
git commit -m "feat: add admin auth middleware and login page"
```

---

## Task 4: Dashboard page

**Files:**
- Create: `server/admin/pages/dashboard.js`

**Step 1: Create `server/admin/pages/dashboard.js`**

```javascript
import { html } from "../layout.js";

function timeAgo(dateStr) {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function kpiCard(label, value, icon, color) {
  return `
    <div class="bg-white border border-slate-200 rounded-xl p-5 flex items-center gap-4">
      <div class="w-10 h-10 rounded-lg flex items-center justify-center" style="background:${color}15">
        <i data-lucide="${icon}" class="w-5 h-5" style="color:${color}"></i>
      </div>
      <div>
        <div class="text-2xl font-semibold mono">${value.toLocaleString()}</div>
        <div class="text-xs text-slate-500 mt-0.5">${label}</div>
      </div>
    </div>`;
}

export function dashboardPage(kpis, activity) {
  const body = `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      ${kpiCard("Total Teams", kpis.teams, "users", "#2563EB")}
      ${kpiCard("Active Users", kpis.users, "key", "#2563EB")}
      ${kpiCard("Calls Today", kpis.callsToday, "zap", "#F97316")}
      ${kpiCard("Calls (7 days)", kpis.callsWeek, "trending-up", "#F97316")}
    </div>

    <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div class="px-5 py-4 border-b border-slate-100">
        <h2 class="text-sm font-semibold text-slate-700">Recent Activity</h2>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50">
            <tr>
              <th class="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Time</th>
              <th class="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Client</th>
              <th class="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Team</th>
              <th class="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Tool</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${activity.length === 0
              ? `<tr><td colspan="4" class="px-4 py-8 text-center text-slate-400 text-sm">No activity yet</td></tr>`
              : activity.map(row => {
                  const teamId = row.api_keys?.team_id;
                  const teamName = row.api_keys?.teams?.name ?? "—";
                  const clientName = row.api_keys?.client_name ?? "Unknown";
                  return `
                    <tr class="hover:bg-slate-50 transition-colors cursor-pointer" ${teamId ? `onclick="location.href='/admin/teams/${teamId}'"` : ""}>
                      <td class="px-4 py-3 text-slate-500 mono text-xs">${timeAgo(row.called_at)}</td>
                      <td class="px-4 py-3 font-medium">${clientName}</td>
                      <td class="px-4 py-3 text-slate-600">${teamName}</td>
                      <td class="px-4 py-3"><span class="mono text-xs bg-slate-100 px-2 py-0.5 rounded">${row.tool_name}</span></td>
                    </tr>`;
                }).join("")
            }
          </tbody>
        </table>
      </div>
    </div>`;

  return html("Dashboard", body, { active: "dashboard" });
}
```

**Step 2: Verify it compiles**

```bash
cd /Users/mlubout/Documents/GitHub/mcp-agentic/server && node --input-type=module --eval "import './admin/pages/dashboard.js'; console.log('ok')"
```

Expected: `ok`

**Step 3: Commit**

```bash
git add server/admin/pages/dashboard.js
git commit -m "feat: add admin dashboard page"
```

---

## Task 5: Teams list and team detail pages

**Files:**
- Create: `server/admin/pages/teams.js`
- Create: `server/admin/pages/team-detail.js`

**Step 1: Create `server/admin/pages/teams.js`**

```javascript
import { html } from "../layout.js";

export function teamsPage(teams, error = "") {
  const body = `
    <div class="flex items-center justify-between mb-6">
      <div></div>
      <button onclick="document.getElementById('new-team-form').classList.toggle('hidden')"
        class="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer">
        <i data-lucide="plus" class="w-4 h-4"></i> New Team
      </button>
    </div>

    <div id="new-team-form" class="hidden bg-white border border-slate-200 rounded-xl p-5 mb-6">
      <h2 class="text-sm font-semibold mb-3">Create Team</h2>
      ${error ? `<div class="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">${error}</div>` : ""}
      <form method="POST" action="/admin/teams" class="flex gap-3">
        <input name="name" type="text" required placeholder="Team name (e.g. Acme Corp)"
          class="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
        <button type="submit"
          class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer">
          Create
        </button>
      </form>
    </div>

    <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-slate-50">
          <tr>
            <th class="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Team</th>
            <th class="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Users</th>
            <th class="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Calls (7d)</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          ${teams.length === 0
            ? `<tr><td colspan="3" class="px-5 py-8 text-center text-slate-400">No teams yet — create one above</td></tr>`
            : teams.map(t => `
                <tr class="hover:bg-slate-50 transition-colors cursor-pointer" onclick="location.href='/admin/teams/${t.id}'">
                  <td class="px-5 py-3 font-medium flex items-center gap-2">
                    ${t.name}
                    <i data-lucide="chevron-right" class="w-3 h-3 text-slate-400"></i>
                  </td>
                  <td class="px-5 py-3 text-slate-600">${t.userCount}</td>
                  <td class="px-5 py-3 mono text-sm">${t.callsWeek.toLocaleString()}</td>
                </tr>`).join("")
          }
        </tbody>
      </table>
    </div>`;

  return html("Teams", body, { active: "teams" });
}
```

**Step 2: Create `server/admin/pages/team-detail.js`**

```javascript
import { html } from "../layout.js";

function timeAgo(dateStr) {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function teamDetailPage(team) {
  const body = `
    <div class="flex items-center gap-3 mb-6">
      <a href="/admin/teams" class="text-slate-400 hover:text-slate-600 transition-colors">
        <i data-lucide="arrow-left" class="w-4 h-4"></i>
      </a>
      <a href="/admin/users/create?team=${team.id}"
        class="ml-auto flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer">
        <i data-lucide="user-plus" class="w-4 h-4"></i> Add User
      </a>
    </div>

    <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-slate-50">
          <tr>
            <th class="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">User</th>
            <th class="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Calls (7d)</th>
            <th class="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Last Active</th>
            <th class="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Status</th>
            <th class="px-5 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          ${team.users.length === 0
            ? `<tr><td colspan="5" class="px-5 py-8 text-center text-slate-400">No users yet — <a href="/admin/users/create?team=${team.id}" class="text-blue-600 hover:underline">add one</a></td></tr>`
            : team.users.map(u => `
                <tr class="hover:bg-slate-50 transition-colors">
                  <td class="px-5 py-3 font-medium">${u.client_name}</td>
                  <td class="px-5 py-3 mono text-sm">${u.callsWeek.toLocaleString()}</td>
                  <td class="px-5 py-3 text-slate-500 text-xs">${timeAgo(u.lastActive)}</td>
                  <td class="px-5 py-3">
                    <span class="text-xs px-2 py-0.5 rounded-full font-medium ${u.is_active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}">
                      ${u.is_active ? "Active" : "Revoked"}
                    </span>
                  </td>
                  <td class="px-5 py-3 text-right">
                    ${u.is_active ? `
                      <form method="POST" action="/admin/users/${u.id}/revoke" onsubmit="return confirm('Revoke access for ${u.client_name}? They will no longer be able to use AAFM.')">
                        <button type="submit" class="text-xs text-red-600 hover:text-red-800 font-medium cursor-pointer transition-colors">Revoke</button>
                      </form>` : ""
                    }
                  </td>
                </tr>`).join("")
          }
        </tbody>
      </table>
    </div>`;

  return html(team.name, body, { active: "teams" });
}
```

**Step 3: Verify both compile**

```bash
cd /Users/mlubout/Documents/GitHub/mcp-agentic/server && node --input-type=module --eval "import './admin/pages/teams.js'; import './admin/pages/team-detail.js'; console.log('ok')"
```

Expected: `ok`

**Step 4: Commit**

```bash
git add server/admin/pages/teams.js server/admin/pages/team-detail.js
git commit -m "feat: add teams list and team detail pages"
```

---

## Task 6: Create user page

**Files:**
- Create: `server/admin/pages/user-create.js`

**Step 1: Create `server/admin/pages/user-create.js`**

```javascript
import { html } from "../layout.js";

export function userCreatePage(teams, prefillTeamId = "", error = "") {
  const body = `
    <div class="flex items-center gap-3 mb-6">
      <a href="/admin/teams" class="text-slate-400 hover:text-slate-600 transition-colors">
        <i data-lucide="arrow-left" class="w-4 h-4"></i>
      </a>
    </div>

    <div class="bg-white border border-slate-200 rounded-xl p-6 max-w-md">
      ${error ? `<div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">${error}</div>` : ""}
      <form method="POST" action="/admin/users/create" class="flex flex-col gap-4">
        <div>
          <label for="client_name" class="block text-sm font-medium text-slate-700 mb-1">Client Name <span class="text-red-500">*</span></label>
          <input id="client_name" name="client_name" type="text" required placeholder="e.g. John Smith"
            class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>
        <div>
          <label for="team_id" class="block text-sm font-medium text-slate-700 mb-1">Team</label>
          <select id="team_id" name="team_id"
            class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">— No team —</option>
            ${teams.map(t => `<option value="${t.id}" ${t.id === prefillTeamId ? "selected" : ""}>${t.name}</option>`).join("")}
          </select>
        </div>
        <button type="submit"
          class="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg text-sm transition-colors cursor-pointer">
          Generate API Key
        </button>
      </form>
    </div>`;

  return html("Create User", body, { active: "teams" });
}

export function userCreatedPage(clientName, apiKey) {
  const body = `
    <div class="max-w-md">
      <div class="bg-green-50 border border-green-200 rounded-xl p-5 mb-6 flex items-start gap-3">
        <i data-lucide="check-circle-2" class="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0"></i>
        <div>
          <div class="text-sm font-semibold text-green-800">User created: ${clientName}</div>
          <div class="text-sm text-green-700 mt-0.5">Copy this API key now — it will not be shown again.</div>
        </div>
      </div>

      <div class="bg-white border border-slate-200 rounded-xl p-5">
        <label class="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">API Key</label>
        <div class="flex gap-2">
          <code id="api-key" class="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm mono break-all">${apiKey}</code>
          <button onclick="navigator.clipboard.writeText('${apiKey}').then(()=>{this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',2000)})"
            class="flex-shrink-0 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium px-3 py-2 rounded-lg transition-colors cursor-pointer">
            Copy
          </button>
        </div>
      </div>

      <div class="mt-4 flex gap-3">
        <a href="/admin/users/create" class="text-sm text-blue-600 hover:underline">Create another user</a>
        <span class="text-slate-300">|</span>
        <a href="/admin/teams" class="text-sm text-blue-600 hover:underline">Back to teams</a>
      </div>
    </div>`;

  return html("User Created", body, { active: "teams" });
}
```

**Step 2: Verify it compiles**

```bash
cd /Users/mlubout/Documents/GitHub/mcp-agentic/server && node --input-type=module --eval "import './admin/pages/user-create.js'; console.log('ok')"
```

Expected: `ok`

**Step 3: Commit**

```bash
git add server/admin/pages/user-create.js
git commit -m "feat: add create user page with one-time key display"
```

---

## Task 7: Admin router — wire everything together

**Files:**
- Create: `server/admin/router.js`
- Modify: `server/index.js`

**Step 1: Create `server/admin/router.js`**

```javascript
import { Router } from "express";
import crypto from "crypto";
import { sessionMiddleware, requireAdmin } from "./auth.js";
import { loginPage } from "./pages/login.js";
import { dashboardPage } from "./pages/dashboard.js";
import { teamsPage } from "./pages/teams.js";
import { teamDetailPage } from "./pages/team-detail.js";
import { userCreatePage, userCreatedPage } from "./pages/user-create.js";
import {
  getKpis, getRecentActivity, getTeams, getTeam,
  createTeam, createUser, revokeUser, getTeamList
} from "./queries.js";

const router = Router();
router.use(sessionMiddleware);

// ── Login / Logout ─────────────────────────────────────────────────────────
router.get("/login", (req, res) => {
  if (req.session?.admin) return res.redirect("/admin");
  res.send(loginPage());
});

router.post("/login", express_urlencoded(), (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
    req.session.admin = true;
    return res.redirect("/admin");
  }
  res.send(loginPage("Incorrect password. Try again."));
});

router.post("/logout", (req, res) => {
  req.session = null;
  res.redirect("/admin/login");
});

// ── All routes below require admin session ─────────────────────────────────
router.use(requireAdmin);

// ── Dashboard ──────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const [kpis, activity] = await Promise.all([getKpis(), getRecentActivity()]);
    res.send(dashboardPage(kpis, activity));
  } catch (err) {
    res.status(500).send(`Error: ${err.message}`);
  }
});

// ── Teams list ─────────────────────────────────────────────────────────────
router.get("/teams", async (req, res) => {
  const teams = await getTeams();
  res.send(teamsPage(teams));
});

router.post("/teams", express_urlencoded(), async (req, res) => {
  const { name } = req.body;
  try {
    await createTeam(name.trim());
    res.redirect("/admin/teams");
  } catch (err) {
    const teams = await getTeams();
    res.send(teamsPage(teams, err.message));
  }
});

// ── Team detail ────────────────────────────────────────────────────────────
router.get("/teams/:id", async (req, res) => {
  const team = await getTeam(req.params.id);
  if (!team) return res.status(404).send("Team not found");
  res.send(teamDetailPage(team));
});

// ── Create user ────────────────────────────────────────────────────────────
router.get("/users/create", async (req, res) => {
  const teams = await getTeamList();
  res.send(userCreatePage(teams, req.query.team ?? ""));
});

router.post("/users/create", express_urlencoded(), async (req, res) => {
  const { client_name, team_id } = req.body;
  try {
    const rawKey = crypto.randomBytes(32).toString("hex");
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
    await createUser(client_name.trim(), team_id || null, keyHash);
    res.send(userCreatedPage(client_name.trim(), rawKey));
  } catch (err) {
    const teams = await getTeamList();
    res.send(userCreatePage(teams, req.body.team_id ?? "", err.message));
  }
});

// ── Revoke user ────────────────────────────────────────────────────────────
router.post("/users/:id/revoke", async (req, res) => {
  await revokeUser(req.params.id);
  res.redirect("back");
});

// ── URL-encoded form parser (used for POST handlers) ──────────────────────
function express_urlencoded() {
  return (await import("express")).default.urlencoded({ extended: false });
}

export default router;
```

**Step 2: Add admin router to `server/index.js`**

Add these two lines after the existing imports (around line 8):

```javascript
import adminRouter from "./admin/router.js";
```

And after `app.use(express.json());` (around line 11):

```javascript
app.use("/admin", adminRouter);
```

**Step 3: Add `ADMIN_PASSWORD` startup validation**

In `server/index.js`, add `"ADMIN_PASSWORD"` to the existing validation array:

```javascript
// Before:
for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {

// After:
for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ADMIN_PASSWORD"]) {
```

**Step 4: Start the server and verify it starts**

First set env var locally:
```bash
cd /Users/mlubout/Documents/GitHub/mcp-agentic/server && ADMIN_PASSWORD=test123 node index.js &
sleep 2
curl -s http://localhost:3000/admin/login | grep -o "AAFM Admin"
kill %1
```

Expected: `AAFM Admin` (confirms login page renders)

**Step 5: Commit**

```bash
cd /Users/mlubout/Documents/GitHub/mcp-agentic
git add server/admin/router.js server/index.js
git commit -m "feat: wire admin router into Express server"
```

---

## Task 8: Deploy and verify

**Step 1: Push to GitHub**

```bash
cd /Users/mlubout/Documents/GitHub/mcp-agentic
git push
```

**Step 2: Set `ADMIN_PASSWORD` on Railway**

```bash
railway variables set ADMIN_PASSWORD=<choose-a-strong-password>
```

**Step 3: Trigger Railway redeploy**

```bash
railway up --detach
```

**Step 4: Verify admin panel is live**

```bash
curl -s https://aafm-hosted-production.up.railway.app/admin/login | grep -o "AAFM Admin"
```

Expected: `AAFM Admin`

**Step 5: Smoke test in browser**

1. Go to `https://aafm-hosted-production.up.railway.app/admin/login`
2. Enter the password → should land on Dashboard
3. Create a team → should appear in Teams list
4. Add a user to that team → key shown once
5. Revoke the user → status changes to Revoked
6. Dashboard KPI cards show counts

**Step 6: Final commit if any fixes needed**

```bash
git add -A && git commit -m "fix: resolve any issues found during admin panel smoke test"
git push
```
