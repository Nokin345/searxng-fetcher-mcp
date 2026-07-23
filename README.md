# SearXNG Fetcher MCP

MCP server with two tools:

- **searxng_web_search** — Web search via SearXNG. Supports pagination, time range, language, safe search, categories, engines, and JSON output.
- **web_url_read** — Fetch any URL and return readable content as markdown. Converts HTML, JSON, YAML, TOML, XML. Rejects binary/media. Supports section extraction and pagination.

## Requirements

A SearXNG instance is **required**. Set `SEARXNG_URL` in `.env`.

## Running with Docker

```bash
cp .env.example .env
# Edit .env and set SEARXNG_URL to your SearXNG instance
nano .env

docker compose up --build
```

The server will be available on port 8080.

## Configuration

```env
# Required: Your SearXNG instance URL
SEARXNG_URL=https://searxng.example.com

# HTTP server settings
MCP_HTTP_PORT=8080
MCP_HTTP_HOST=0.0.0.0

# Timeout settings (milliseconds)
FETCH_TIMEOUT_MS=10000
SEARCH_TIMEOUT_MS=10000

# URL reader settings
URL_READ_MAX_CONTENT_BYTES=5242880
URL_READER_USER_AGENT=searxng-fetcher-mcp/1.0
```

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp` | POST/GET/DELETE | Streamable HTTP (modern MCP clients) |
| `/sse` | GET | SSE (legacy MCP clients) |
| `/messages` | POST | SSE message endpoint |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SEARXNG_URL` | Yes | - | Your SearXNG instance URL |
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
