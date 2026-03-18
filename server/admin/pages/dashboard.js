import { html, escHtml } from "../layout.js";

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
                    <tr class="hover:bg-slate-50 transition-colors cursor-pointer" ${teamId ? `onclick="location.href='/admin/teams/${escHtml(teamId)}'"` : ""}>
                      <td class="px-4 py-3 text-slate-500 mono text-xs">${timeAgo(row.called_at)}</td>
                      <td class="px-4 py-3 font-medium">${escHtml(clientName)}</td>
                      <td class="px-4 py-3 text-slate-600">${escHtml(teamName)}</td>
                      <td class="px-4 py-3"><span class="mono text-xs bg-slate-100 px-2 py-0.5 rounded">${escHtml(row.tool_name)}</span></td>
                    </tr>`;
                }).join("")
            }
          </tbody>
        </table>
      </div>
    </div>`;

  return html("Dashboard", body, { active: "dashboard" });
}
