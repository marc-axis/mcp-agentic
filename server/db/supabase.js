import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

let _supabase = null;
function getClient() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return _supabase;
}

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
  await getClient().from("usage_logs").insert({
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
  const { error } = await getClient().from("features").upsert(
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
  const { error } = await getClient().from("feature_artifacts").upsert(
    { feature_id: featureId, artifact_type: artifactType, content, updated_at: new Date().toISOString() },
    { onConflict: "feature_id,artifact_type" }
  );
  if (error) throw new Error(`Failed to save artifact '${artifactType}': ${error.message}`);
}
