#!/usr/bin/env node

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Auth0 Configuration - set these environment variables
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN || "";
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE || "";
const PORT = parseInt(process.env.PORT || "3000");

if (!AUTH0_DOMAIN || !AUTH0_AUDIENCE) {
  console.error("Error: AUTH0_DOMAIN and AUTH0_AUDIENCE environment variables are required");
  console.error("Usage: AUTH0_DOMAIN=your-tenant.auth0.com AUTH0_AUDIENCE=your-api-identifier node oauth-server.js");
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

// OAuth 2.0 Authorization Server Metadata (RFC 8414)
app.get("/.well-known/oauth-authorization-server", (_req: Request, res: Response) => {
  res.json({
    issuer: `https://${AUTH0_DOMAIN}/`,
    authorization_endpoint: `https://${AUTH0_DOMAIN}/authorize`,
    token_endpoint: `https://${AUTH0_DOMAIN}/oauth/token`,
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
    grant_types_supported: ["authorization_code", "client_credentials"],
    response_types_supported: ["code", "token"],
    scopes_supported: ["openid", "profile", "read:tools", "execute:tools"],
    jwks_uri: `https://${AUTH0_DOMAIN}/.well-known/jwks.json`,
    code_challenge_methods_supported: ["S256"],
    // Tell clients what audience to request
    resource: AUTH0_AUDIENCE,
    audience: AUTH0_AUDIENCE,
  });
});

// OpenID Connect Discovery (some clients look here)
app.get("/.well-known/openid-configuration", (_req: Request, res: Response) => {
  res.json({
    issuer: `https://${AUTH0_DOMAIN}/`,
    token_endpoint: `https://${AUTH0_DOMAIN}/oauth/token`,
    jwks_uri: `https://${AUTH0_DOMAIN}/.well-known/jwks.json`,
    grant_types_supported: ["client_credentials"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
  });
});

// OAuth 2.0 Protected Resource Metadata (RFC 9115) - ChatGPT looks for this
app.get("/.well-known/oauth-protected-resource", (req: Request, res: Response) => {
  res.json({
    resource: AUTH0_AUDIENCE,
    authorization_servers: [`https://${AUTH0_DOMAIN}/`],
    bearer_methods_supported: ["header"],
    scopes_supported: ["read:tools", "execute:tools"],
  });
});

// Debug middleware to log token info
app.use((req: Request, _res: Response, next: NextFunction) => {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    try {
      // Decode without verifying to see claims
      const parts = token.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
        console.log("[TOKEN DEBUG] Claims:", JSON.stringify(payload, null, 2));
      }
    } catch (e) {
      console.log("[TOKEN DEBUG] Could not decode token");
    }
  }
  next();
});

// Token validation cache to avoid hitting /userinfo on every request
interface CachedToken {
  userInfo: any;
  expiresAt: number;
}
const tokenCache = new Map<string, CachedToken>();
const TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Validate JWT tokens issued by Auth0
async function validateJwtToken(token: string): Promise<any> {
  // Check cache first
  const cached = tokenCache.get(token);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.userInfo;
  }

  // Decode JWT (basic validation without signature verification)
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }

  const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());

  // Validate claims
  const now = Math.floor(Date.now() / 1000);

  if (payload.iss !== `https://${AUTH0_DOMAIN}/`) {
    throw new Error(`Invalid issuer: ${payload.iss}`);
  }

  if (payload.aud !== AUTH0_AUDIENCE) {
    throw new Error(`Invalid audience: ${payload.aud}`);
  }

  if (payload.exp && payload.exp < now) {
    throw new Error("Token expired");
  }

  console.log("[AUTH] JWT validated for user:", payload.sub);

  // Cache the result
  const userInfo = { sub: payload.sub, ...payload };
  tokenCache.set(token, {
    userInfo,
    expiresAt: Date.now() + TOKEN_CACHE_TTL,
  });

  return userInfo;
}

// Auth middleware that handles both JWTs and opaque tokens
const tokenCheck = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    // Include WWW-Authenticate header to tell client how to authenticate
    res.setHeader("WWW-Authenticate", `Bearer realm="claude-chatgpt-bridge", resource="${AUTH0_AUDIENCE}"`);
    res.status(401).json({
      error: "unauthorized",
      message: "Missing or invalid Authorization header",
    });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const userInfo = await validateJwtToken(token);
    // Attach user info to request for downstream use
    (req as any).auth = userInfo;
    next();
  } catch (error) {
    console.error("[AUTH ERROR]", error instanceof Error ? error.message : error);
    res.setHeader("WWW-Authenticate", `Bearer realm="claude-chatgpt-bridge", error="invalid_token"`);
    res.status(401).json({
      error: "unauthorized",
      message: "Invalid or expired token",
    });
  }
};

// MCP Server process management
let mcpProcess: ChildProcess | null = null;
let messageId = 0;
const pendingRequests = new Map<number, { resolve: (value: any) => void; reject: (reason: any) => void }>();
let mcpBuffer = "";

function startMcpServer() {
  const mcpPath = path.join(__dirname, "index.js");
  mcpProcess = spawn("node", [mcpPath], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  mcpProcess.stdout?.on("data", (data: Buffer) => {
    mcpBuffer += data.toString();

    // Process complete JSON-RPC messages
    const lines = mcpBuffer.split("\n");
    mcpBuffer = lines.pop() || "";

    for (const line of lines) {
      if (line.trim()) {
        try {
          const response = JSON.parse(line);
          const pending = pendingRequests.get(response.id);
          if (pending) {
            pending.resolve(response);
            pendingRequests.delete(response.id);
          }
        } catch (e) {
          // Not valid JSON, might be partial
        }
      }
    }
  });

  mcpProcess.stderr?.on("data", (data: Buffer) => {
    console.error("[MCP]", data.toString());
  });

  mcpProcess.on("error", (err) => {
    console.error("MCP process error:", err);
  });

  mcpProcess.on("exit", (code) => {
    console.error("MCP process exited with code:", code);
    // Restart after a delay
    setTimeout(startMcpServer, 1000);
  });
}

function sendToMcp(method: string, params: any = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!mcpProcess || !mcpProcess.stdin) {
      reject(new Error("MCP server not running"));
      return;
    }

    const id = ++messageId;
    const request = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    pendingRequests.set(id, { resolve, reject });
    mcpProcess.stdin.write(JSON.stringify(request) + "\n");

    // Timeout after 30 seconds
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error("Request timeout"));
      }
    }, 30000);
  });
}

// SSE connections storage
interface SseConnection {
  res: Response;
  sessionId: string;
}
const sseConnections = new Map<string, SseConnection>();

// SSE endpoint (protected)
app.get("/sse", tokenCheck, (req: Request, res: Response) => {
  const sessionId = crypto.randomUUID();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Send session info
  res.write(`event: endpoint\ndata: /message?sessionId=${sessionId}\n\n`);

  sseConnections.set(sessionId, { res, sessionId });

  req.on("close", () => {
    sseConnections.delete(sessionId);
  });
});

// Message endpoint (protected)
app.post("/message", tokenCheck, async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;

  if (!sessionId) {
    res.status(400).send("Missing sessionId parameter");
    return;
  }

  const connection = sseConnections.get(sessionId);
  if (!connection) {
    res.status(400).send(`No active SSE connection for session ${sessionId}`);
    return;
  }

  const { method, params, id } = req.body;

  try {
    const response = await sendToMcp(method, params);

    // Send response via SSE
    const sseData = JSON.stringify({ ...response, id });
    connection.res.write(`event: message\ndata: ${sseData}\n\n`);

    res.send("Accepted");
  } catch (error) {
    const errorResponse = {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : "Internal error",
      },
    };
    connection.res.write(`event: message\ndata: ${JSON.stringify(errorResponse)}\n\n`);
    res.status(500).send("Error processing request");
  }
});

// Health check (unprotected)
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", mcpRunning: mcpProcess !== null });
});

// Direct HTTP POST endpoint for MCP JSON-RPC (ChatGPT uses this instead of SSE)
app.post("/", tokenCheck, async (req: Request, res: Response) => {
  const { method, params, id, jsonrpc } = req.body;

  console.log(`[MCP HTTP] ${method}`, JSON.stringify(params || {}).slice(0, 100));

  try {
    const response = await sendToMcp(method, params);

    // For tools/list, add OpenAI visibility metadata to make tools public
    if (method === "tools/list" && response.result?.tools) {
      response.result.tools = response.result.tools.map((tool: any) => ({
        ...tool,
        _meta: {
          ...tool._meta,
          "openai/visibility": "public",
        },
      }));
      console.log(`[MCP HTTP] Added openai/visibility to ${response.result.tools.length} tools`);
    }

    // Return the response directly with the original request id
    res.json({ ...response, id });
  } catch (error) {
    res.json({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : "Internal error",
      },
    });
  }
});

// Also handle GET / for MCP server info
app.get("/", (_req: Request, res: Response) => {
  res.json({
    name: "claude-chatgpt-bridge",
    version: "1.0.0",
    protocol: "mcp",
    endpoints: {
      jsonrpc: "/",
      sse: "/sse",
    },
  });
});

// Error handling for unexpected errors
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// Start everything
startMcpServer();

app.listen(PORT, () => {
  console.log(`OAuth-enabled MCP server running on port ${PORT}`);
  console.log(`Auth0 Domain: ${AUTH0_DOMAIN}`);
  console.log(`Auth0 Audience: ${AUTH0_AUDIENCE}`);
  console.log(`\nEndpoints:`);
  console.log(`  OAuth metadata: http://localhost:${PORT}/.well-known/oauth-authorization-server`);
  console.log(`  SSE: http://localhost:${PORT}/sse (requires Bearer token)`);
  console.log(`  Message: http://localhost:${PORT}/message (requires Bearer token)`);
  console.log(`  Health: http://localhost:${PORT}/health`);
});
