import "dotenv/config";
import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { requireApiKey, trackUsage } from "./middleware/auth.js";
import { TOOLS, handleToolCall } from "./mcp/tools.js";

const app = express();
app.use(express.json());

// ── Health check (Railway uses this) ──────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok" }));

// ── Streamable HTTP transport (Claude Code and newer clients) ─────────────
app.post("/mcp", requireApiKey, async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const mcpServer = buildMcpServer(req.apiKeyId);
  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, req.body);
  res.on("finish", () => mcpServer.close().catch(() => {}));
});

// ── SSE transport (Cursor, VS Code, older clients) ────────────────────────
const sseSessions = new Map();

app.get("/sse", requireApiKey, async (req, res) => {
  const transport = new SSEServerTransport("/sse/message", res);
  const mcpServer = buildMcpServer(req.apiKeyId);
  sseSessions.set(transport.sessionId, { transport, mcpServer });
  res.on("close", () => {
    sseSessions.delete(transport.sessionId);
    mcpServer.close().catch(() => {});
  });
  await mcpServer.connect(transport);
});

app.post("/sse/message", requireApiKey, async (req, res) => {
  const sessionId = req.query.sessionId;
  const session = sseSessions.get(sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });
  await session.transport.handlePostMessage(req, res, req.body);
});

// ── MCP server factory ────────────────────────────────────────────────────
function buildMcpServer(apiKeyId) {
  const server = new Server(
    { name: "AAFM Hosted", version: "2.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    trackUsage(apiKeyId, name, args?.feature_slug ?? args?.slug ?? null);
    try {
      return await handleToolCall(name, args, apiKeyId);
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  });

  return server;
}

// ── Start ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => console.log(`AAFM hosted server running on port ${PORT}`));
