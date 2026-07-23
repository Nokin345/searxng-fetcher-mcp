import express, { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

interface Sessions {
  streamable: Record<string, StreamableHTTPServerTransport>;
  sse: Record<string, SSEServerTransport>;
}

export async function createHttpServer(
  createMcpServer: () => Promise<McpServer>,
  port: number,
  host: string
): Promise<{ app: express.Application; shutdown: () => Promise<void> }> {
  const app = express();
  app.use(express.json());

  const sessions: Sessions = {
    streamable: {},
    sse: {},
  };

  let httpServer: any = null;

  app.get("/", (_req: Request, res: Response) => {
    res.send(`
      <html>
        <head><title>MCP Server</title></head>
        <body>
          <h1>MCP Server</h1>
          <p>Endpoints:</p>
          <ul>
            <li><code>/mcp</code> - Streamable HTTP (modern MCP protocol)</li>
            <li><code>/sse</code> - SSE (legacy MCP protocol)</li>
          </ul>
        </body>
      </html>
    `);
  });

  app.post("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    try {
      if (sessionId && sessions.streamable[sessionId]) {
        transport = sessions.streamable[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid: string) => {
            sessions.streamable[sid] = transport;
          },
        });

        transport.onclose = () => {
          if (transport.sessionId) {
            delete sessions.streamable[transport.sessionId];
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
    if (!sessionId || !sessions.streamable[sessionId]) {
      if (!res.headersSent) {
        res.status(400).send("Invalid or missing session ID");
      }
      return;
    }

    try {
      const transport = sessions.streamable[sessionId];
      await transport.handleRequest(req, res);
    } catch (error: any) {
      if (!res.headersSent) {
        res.status(500).send(`Internal server error: ${error.message}`);
      }
    }
  });

  app.delete("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !sessions.streamable[sessionId]) {
      if (!res.headersSent) {
        res.status(400).send("Invalid or missing session ID");
      }
      return;
    }

    try {
      const transport = sessions.streamable[sessionId];
      await transport.handleRequest(req, res);
    } catch (error: any) {
      if (!res.headersSent) {
        res.status(500).send(`Internal server error: ${error.message}`);
      }
    }
  });

  app.get("/sse", async (req: Request, res: Response) => {
    try {
      const transport = new SSEServerTransport("/messages", res);
      sessions.sse[transport.sessionId] = transport;

      res.on("close", () => {
        delete sessions.sse[transport.sessionId];
      });

      const server = await createMcpServer();
      await server.connect(transport);
    } catch (error: any) {
      if (!res.headersSent) {
        res.status(500).send(`Internal server error: ${error.message}`);
      }
    }
  });

  app.post("/messages", async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    const transport = sessionId ? sessions.sse[sessionId] : undefined;

    if (transport) {
      try {
        await transport.handlePostMessage(req, res, req.body);
      } catch (error: any) {
        if (!res.headersSent) {
          res.status(500).send(`Internal server error: ${error.message}`);
        }
      }
    } else {
      if (!res.headersSent) {
        res.status(400).send("No transport found for session ID");
      }
    }
  });

  httpServer = app.listen(port, host, () => {
    console.log(`MCP HTTP server listening on ${host}:${port}`);
  });

  return {
    app,
    shutdown: async () => {
      Object.values(sessions.streamable).forEach((t) => {
        try { t.close(); } catch {}
      });
      Object.values(sessions.sse).forEach((t) => {
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
