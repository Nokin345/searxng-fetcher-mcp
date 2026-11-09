import express, { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

export interface ServerInfo {
  name: string;
  version: string;
}

/**
 * Streamable HTTP transport only (MCP spec 2025-03-10+).
 *
 * The legacy HTTP+SSE transport (`GET /sse` + `POST /messages`, spec 2024-10-22)
 * is deprecated in the SDK and implemented no session resumption here, so it
 * held one long-lived socket per session for no benefit. Note that `/mcp` may
 * still answer a POST with `text/event-stream`: that is Streamable HTTP's own
 * streaming, not the legacy transport.
 */
export async function createHttpServer(
  createMcpServer: () => Promise<McpServer>,
  port: number,
  host: string,
  info: ServerInfo
): Promise<{ app: express.Application; shutdown: () => Promise<void> }> {
  const app = express();
  app.use(express.json());

  const sessions: Record<string, StreamableHTTPServerTransport> = {};

  let httpServer: any = null;

  app.get("/healthz", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      name: info.name,
      version: info.version,
      transport: "streamable-http",
      endpoint: "/mcp",
    });
  });

  app.post("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    try {
      if (sessionId && sessions[sessionId]) {
        transport = sessions[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid: string) => {
            sessions[sid] = transport;
          },
        });

        transport.onclose = () => {
          if (transport.sessionId) {
            delete sessions[transport.sessionId];
          }
        };

        const server = await createMcpServer();
        await server.connect(transport);
      } else {
        if (!res.headersSent) {
          res.status(400).json({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Bad Request: No valid session ID provided",
            },
            id: null,
          });
        }
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error: any) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: `Internal server error: ${error.message}`,
          },
          id: null,
        });
      }
    }
  });

  app.get("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const transport = sessionId ? sessions[sessionId] : undefined;
    if (!transport) {
      if (!res.headersSent) {
        res.status(400).send("Invalid or missing session ID");
      }
      return;
    }

    try {
      await transport.handleRequest(req, res);
    } catch (error: any) {
      if (!res.headersSent) {
        res.status(500).send(`Internal server error: ${error.message}`);
      }
    }
  });

  app.delete("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const transport = sessionId ? sessions[sessionId] : undefined;
    if (!transport) {
      if (!res.headersSent) {
        res.status(400).send("Invalid or missing session ID");
      }
      return;
    }

    try {
      await transport.handleRequest(req, res);
    } catch (error: any) {
      if (!res.headersSent) {
        res.status(500).send(`Internal server error: ${error.message}`);
      }
    }
  });

  httpServer = app.listen(port, host, () => {
    console.log(`MCP HTTP server listening on ${host}:${port} (Streamable HTTP: /mcp)`);
  });

  return {
    app,
    shutdown: async () => {
      Object.values(sessions).forEach((t) => {
        try { t.close(); } catch {}
      });

      if (httpServer) {
        await new Promise<void>((resolve, reject) => {
          httpServer.close((err: Error) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
    },
  };
}

function isInitializeRequest(body: any): boolean {
  return body?.method === "initialize" && body?.jsonrpc === "2.0";
}
