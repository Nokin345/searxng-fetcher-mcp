import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { isWebSearchArgs, isUrlReadArgs } from "./types.js";
import { performWebSearch } from "./search.js";
import { fetchUrl } from "./url-reader.js";
import { createHttpServer } from "./http-server.js";

const SEARCH_DESCRIPTION =
  "Searches the web using SearXNG and returns a list of results, each with a title, URL, and content snippet. " +
  "The required parameter name is exactly `query`. " +
  "Results are ranked by SearXNG score and truncated to `num_results` (default 10); the trailing "
  "footers report how many results were withheld and which engines did not answer. "
  "Use `pageno` to paginate; combine `time_range` and `language` to narrow scope. " +
  "To read the full text of a result URL, follow up with `web_url_read`.";

const URL_READ_DESCRIPTION =
  "Fetches a URL and returns readable content as markdown. " +
  "HTML is converted to markdown; JSON, YAML, TOML, XML are returned as fenced code blocks. " +
  "Binary/media/archive/PDF downloads are rejected. " +
  "For large pages, use `startChar`/`maxLength` to paginate. " +
  "Use `section` to extract content under a specific heading. " +
  "Use `readHeadings: true` to list all headings only. " +
  "Returns an error string if the URL is unreachable.";

function getBaseUrl(): string {
  const url = process.env.SEARXNG_URL?.trim();
  if (!url) {
    throw new Error("SEARXNG_URL environment variable is required. Set it to your SearXNG instance URL.");
  }
  return url.replace(/\/+$/, "");
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "searxng-fetcher-mcp",
    version: "1.0.0",
  });

  server.tool(
    "searxng_web_search",
    SEARCH_DESCRIPTION,
    {
      query: z.string().describe("The search query string."),
      pageno: z.number().int().min(1).optional().describe("Search page number (starts at 1)").default(1),
      time_range: z.enum(["day", "week", "month", "year"]).optional().describe("Time range of search"),
      language: z.string().optional().describe("Language code (e.g., 'en', 'fr', 'de')").default("all"),
      safesearch: z.enum(["0", "1", "2"]).optional().describe("Safe search level (0: None, 1: Moderate, 2: Strict)"),
      min_score: z
        .number()
        .min(0)
        .optional()
        .describe(
          "Minimum relevance score threshold (default 0 = no filtering). SearXNG scores are summed " +
            "across the engines that agree on a result, so they are not 0-1: roughly 15-22 results " +
            "per query score >= 1, 4-8 score >= 3, and the top hit scores 10-50.",
        ),
      num_results: z.number().int().min(1).max(20).optional().describe("Max results to return (1-20, default 10)"),
      categories: z.string().optional().describe("Comma-separated SearXNG categories"),
      engines: z.string().optional().describe("Comma-separated SearXNG engine names"),
      response_format: z.enum(["text", "json"]).optional().describe("Response format: text or json").default("text"),
    },
    async (args) => {
      if (!isWebSearchArgs(args)) {
        return {
          content: [{ type: "text", text: "Invalid search arguments." }],
          isError: true,
        };
      }

      const searxngUrl = getBaseUrl();
      const result = await performWebSearch(args, searxngUrl);

      return {
        content: [{ type: "text", text: result }],
      };
    }
  );

  server.tool(
    "web_url_read",
    URL_READ_DESCRIPTION,
    {
      url: z.string().describe("URL to fetch and read."),
      startChar: z.number().min(0).optional().describe("Starting character position (default: 0)"),
      maxLength: z.number().min(1).optional().describe("Maximum characters to return"),
      section: z.string().optional().describe("Extract content under a specific heading"),
      paragraphRange: z.string().optional().describe("Paragraph range (e.g., '1-5', '3')"),
      readHeadings: z.boolean().optional().describe("Return only headings"),
    },
    async (args) => {
      if (!isUrlReadArgs(args)) {
        return {
          content: [{ type: "text", text: "Invalid URL read arguments." }],
          isError: true,
        };
      }

      const result = await fetchUrl(args.url, args);

      return {
        content: [{ type: "text", text: result }],
      };
    }
  );

  return server;
}

export async function main() {
  const port = parseInt(process.env.MCP_HTTP_PORT || "8080", 10);
  const host = process.env.MCP_HTTP_HOST || "0.0.0.0";

  const { shutdown } = await createHttpServer(
    async () => {
      return createMcpServer();
    },
    port,
    host
  );

  process.on("SIGINT", async () => {
    console.log("Shutting down...");
    await shutdown();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("Shutting down...");
    await shutdown();
    process.exit(0);
  });
}
