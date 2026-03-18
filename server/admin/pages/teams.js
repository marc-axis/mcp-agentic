import { html, escHtml } from "../layout.js";

export function teamsPage(teams, error = "", csrfToken = "") {
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
      ${error ? `<div class="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">${escHtml(error)}</div>` : ""}
      <form method="POST" action="/admin/teams" class="flex gap-3">
        <input type="hidden" name="_csrf" value="${escHtml(csrfToken)}">
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
                <tr class="hover:bg-slate-50 transition-colors cursor-pointer" onclick="location.href='/admin/teams/${escHtml(t.id)}'">
                  <td class="px-5 py-3 font-medium flex items-center gap-2">
                    ${escHtml(t.name)}
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
