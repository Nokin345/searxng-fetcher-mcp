# SearXNG Fetcher MCP

A simple, plug-and-play MCP server that gives your AI tools the ability to search the web and read any URL. No setup required — just configure your SearXNG instance and you're ready to browse.

---

MCP server with two tools:

- **searxng_web_search** — Web search via SearXNG. Supports pagination, time range, language, safe search, categories, engines, and JSON output.
- **web_url_read** — Fetch any URL and return readable content as markdown. Converts HTML, JSON, YAML, TOML, XML. Rejects binary/media. Supports section extraction and pagination.


## Running with Docker

```bash
git clone https://github.com/Nokin345/searxng-fetcher-mcp.git
cd searxng-fetcher-mcp
cp .env.example .env
docker compose up -d --build
```

The server will be available on port 8080.

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp` | POST/GET/DELETE | Streamable HTTP (the only MCP transport) |
| `/healthz` | GET | Liveness probe: name, version, transport |

Streamable HTTP is the MCP transport as of spec 2025-03-10; the legacy HTTP+SSE
transport (`GET /sse` + `POST /messages`) has been removed. A POST to `/mcp` may
still answer `text/event-stream` — that is Streamable HTTP streaming, not SSE.

## Client Configuration

Connect your MCP client using HTTP Streamable Transport. Configure your client with the server URL:

```json
{
  "mcpServers": {
    "searxng-fetcher": {
      "url": "http://<SERVER_IP>:<PORT>/mcp"
    }
  }
}
```

Replace `<SERVER_IP>` with your server's IP address and `<PORT>` with the port from your `.env` file (default: `8080`).

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SEARXNG_URL` | No | http://searxng:8080 | Your SearXNG instance URL |
| `MCP_HTTP_PORT` | No | `8080` | HTTP server port |
| `MCP_HTTP_HOST` | No | `0.0.0.0` | Bind address |
| `FETCH_TIMEOUT_MS` | No | `10000` | URL read timeout in ms |
| `SEARCH_TIMEOUT_MS` | No | `10000` | Search timeout in ms |
| `URL_READ_MAX_CONTENT_BYTES` | No | `5242880` | Max content length for URL read (5MB) |
| `URL_READER_USER_AGENT` | No | `searxng-fetcher-mcp/1.0` | User-Agent header |

## Building Locally

```bash
npm install
npm run build
```

## License

MIT
