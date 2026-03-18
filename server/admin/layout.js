export function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
