# Design: AAFM Admin Panel
**Date:** 2026-03-18
**Status:** Approved

## Goal

A server-rendered web admin panel at `/admin` on the existing Railway server. Allows the operator to manage teams, create users (API keys), view usage analytics, and revoke access — without touching Supabase SQL directly.

---

## Design System

- **Style:** Data-Dense Dashboard
- **Colors:** Primary `#2563EB`, Secondary `#3B82F6`, CTA `#F97316`, Background `#F8FAFC`, Text `#1E293B`
- **Fonts:** Fira Code (headings/monospace) + Fira Sans (body) via Google Fonts CDN
- **Icons:** Lucide via CDN (SVG, no emoji)
- **CSS:** Tailwind CSS via CDN (no build step)
- **Charts:** None (KPI cards + table are sufficient)
- **Interactions:** Row highlight on hover (150ms), confirmation dialogs before destructive actions

---

## Auth

Single admin password set via `ADMIN_PASSWORD` environment variable on Railway. Login sets a signed `cookie-session`. All `/admin/*` routes redirect to `/admin/login` if session is missing or invalid.

---

## Schema Changes

Two migrations on the existing Supabase `aafm-mcp` project:

```sql
-- Migration 1: teams table
create table teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

-- Migration 2: link api_keys to teams
alter table api_keys add column team_id uuid references teams(id);
```

---

## Pages

### `/admin/login`
- Single password field + submit button
- On correct password → set session cookie → redirect to `/admin`
- On wrong password → inline error "Incorrect password"

### `/admin` (Dashboard)
4 KPI cards in a row:
- Total Teams
- Total Users (active)
- Tool Calls Today
- Tool Calls (last 7 days)

Recent Activity table (last 50 rows from `usage_logs`):

| Time | Client | Team | Tool |
|------|--------|------|------|
| 2m ago | John Smith | Acme Corp | start_feature |

- Rows highlight on hover
- Clicking a row navigates to that team's detail page

### `/admin/teams`
- Table: Team name, User count, Calls (7d)
- Each row links to `/admin/teams/:id`
- "New Team" button → inline form (name field + submit)

### `/admin/teams/:id`
- Back link to `/admin/teams`
- "Add User" button → links to `/admin/users/create?team=:id`
- Table: User name, Calls (7d), Last Active, Revoke button
- Revoke → confirmation dialog → sets `is_active = false`

### `/admin/users/create`
- Form fields: Client Name (text), Team (dropdown)
- Submit → generate 32-byte hex API key, hash it, insert into `api_keys`
- Success page shows the plaintext key **once** in a styled copyable box
- Warning: "Save this key — it will not be shown again"

---

## Navigation

Fixed left sidebar (desktop) / top bar with hamburger (mobile):
- Dashboard
- Teams
- (Logout)

---

## Tech

- **Renderer:** Express routes returning HTML strings (template literals)
- **Auth:** `cookie-session` npm package
- **Data:** `@supabase/supabase-js` (already installed in `server/`)
- **CSS:** Tailwind CDN `<script src="https://cdn.tailwindcss.com">`
- **Fonts:** Google Fonts CDN (Fira Code + Fira Sans)
- **Icons:** Lucide CDN `<script src="https://unpkg.com/lucide@latest">`
- **No client-side framework** — vanilla JS only where needed (confirmation dialogs, copy-to-clipboard)

---

## New Files

```
server/
├── admin/
│   ├── router.js       — Express router for all /admin routes
│   ├── auth.js         — Session middleware + login/logout handlers
│   ├── layout.js       — Shared HTML shell (sidebar, head, fonts)
│   ├── pages/
│   │   ├── login.js        — Login page HTML
│   │   ├── dashboard.js    — Dashboard page HTML
│   │   ├── teams.js        — Teams list page HTML
│   │   ├── team-detail.js  — Team detail page HTML
│   │   └── user-create.js  — Create user page HTML
│   └── queries.js      — Supabase queries for admin data
```

`server/index.js` gets one new line:
```javascript
import adminRouter from "./admin/router.js";
app.use("/admin", adminRouter);
```

---

## Success Criteria

- Operator can log in with `ADMIN_PASSWORD` env var
- Can create teams and users from the UI (no Supabase dashboard needed)
- New user's API key shown once on creation, never again
- Can revoke a user with confirmation
- Dashboard shows live KPI counts and recent activity
- Works on desktop (1024px+) and is readable on mobile
