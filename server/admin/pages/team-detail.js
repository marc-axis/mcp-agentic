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
