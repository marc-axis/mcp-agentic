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

// Call after tool execution to log usage — fire and forget
export async function trackUsage(apiKeyId, toolName, featureSlug = null) {
  logUsage(apiKeyId, toolName, featureSlug).catch(() => {});
}
