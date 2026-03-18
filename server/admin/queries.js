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
