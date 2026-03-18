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
