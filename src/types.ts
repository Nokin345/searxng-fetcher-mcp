import { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface SearXNGWebResult {
  title: string;
  content: string;
  url: string;
  score?: number;
  engine?: string;
  engines?: string[];
  category?: string;
  publishedDate?: string;
  thumbnail?: string;
  img_src?: string;
}

export interface SearXNGWeb {
  query: string;
  number_of_results: number;
  results: SearXNGWebResult[];
  sourceFormat?: "json" | "html";
  suggestions?: string[];
  corrections?: string[];
  answers?: string[];
  infoboxes?: Array<{ infobox: string; content?: string }>;
  unresponsive_engines?: Array<[string, string]>;
}

const VALID_TIME_RANGES = ["day", "week", "month", "year"] as const;
const VALID_SAFESEARCH_VALUES = ["0", "1", "2"] as const;
const VALID_RESPONSE_FORMATS = ["text", "json"] as const;

export function isWebSearchArgs(args: unknown): args is {
  query: string;
  pageno?: number;
  time_range?: string;
  language?: string;
  safesearch?: string;
  min_score?: number;
  num_results?: number;
  categories?: string;
  engines?: string;
  response_format?: "text" | "json";
} {
  if (
    typeof args !== "object" ||
    args === null ||
    !("query" in args) ||
    typeof (args as { query: string }).query !== "string"
  ) {
    return false;
  }

  const a = args as Record<string, unknown>;

  if (a.pageno !== undefined && (typeof a.pageno !== "number" || a.pageno < 1)) return false;
  if (a.time_range !== undefined && !(VALID_TIME_RANGES as readonly string[]).includes(a.time_range as string)) return false;
  if (a.language !== undefined && typeof a.language !== "string") return false;
  if (a.safesearch !== undefined && !(VALID_SAFESEARCH_VALUES as readonly string[]).includes(a.safesearch as string)) return false;
  if (a.min_score !== undefined && (typeof a.min_score !== "number" || a.min_score < 0 || a.min_score > 1)) return false;
  if (a.num_results !== undefined && (typeof a.num_results !== "number" || !Number.isInteger(a.num_results) || a.num_results < 1 || a.num_results > 20)) return false;
  if (a.categories !== undefined && typeof a.categories !== "string") return false;
  if (a.engines !== undefined && typeof a.engines !== "string") return false;
  if (a.response_format !== undefined && !(VALID_RESPONSE_FORMATS as readonly string[]).includes(a.response_format as string)) return false;

  return true;
}

export function isUrlReadArgs(args: unknown): args is {
  url: string;
  startChar?: number;
  maxLength?: number;
  section?: string;
  paragraphRange?: string;
  readHeadings?: boolean;
} {
  if (
    typeof args !== "object" ||
    args === null ||
    !("url" in args) ||
    typeof (args as { url: string }).url !== "string"
  ) {
    return false;
  }

  const a = args as Record<string, unknown>;

  if (a.startChar !== undefined && (typeof a.startChar !== "number" || a.startChar < 0)) return false;
  if (a.maxLength !== undefined && (typeof a.maxLength !== "number" || a.maxLength < 1)) return false;
  if (a.section !== undefined && typeof a.section !== "string") return false;
  if (a.paragraphRange !== undefined && typeof a.paragraphRange !== "string") return false;
  if (a.readHeadings !== undefined && typeof a.readHeadings !== "boolean") return false;

  return true;
}

export const WEB_SEARCH_TOOL: Tool = {
  name: "searxng_web_search",
  description:
    "Searches the web using SearXNG and returns a list of results, each with a title, URL, and content snippet. " +
    "The required parameter name is exactly `query`. " +
    "Use `pageno` to paginate; combine `time_range` and `language` to narrow scope. " +
    "To read the full text of a result URL, follow up with `web_url_read`.",
  annotations: {
    readOnlyHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query string.",
      },
      pageno: {
        type: "number",
        description: "Search page number (starts at 1)",
        default: 1,
      },
      time_range: {
        type: "string",
        description: "Time range of search (day, week, month, year)",
        enum: ["day", "week", "month", "year"],
      },
      language: {
        type: "string",
        description: "Language code for search results (e.g., 'en', 'fr', 'de'). Default is instance-dependent.",
        default: "all",
      },
      safesearch: {
        type: "string",
        description: "Safe search filter level (0: None, 1: Moderate, 2: Strict)",
        enum: ["0", "1", "2"],
      },
      min_score: {
        type: "number",
        description: "Minimum relevance score threshold from 0.0 to 1.0.",
        minimum: 0,
        maximum: 1,
      },
      num_results: {
        type: "number",
        description: "Maximum number of results to return (1-20).",
        minimum: 1,
        maximum: 20,
      },
      categories: {
        type: "string",
        description: "Comma-separated SearXNG categories (e.g., 'general,news').",
      },
      engines: {
        type: "string",
        description: "Comma-separated SearXNG engine names to query (e.g., 'google,bing,ddg').",
      },
      response_format: {
        type: "string",
        description: "Response format: formatted text or raw JSON. Default: text.",
        enum: ["text", "json"],
        default: "text",
      },
    },
    required: ["query"],
  },
};

export const URL_READ_TOOL: Tool = {
  name: "web_url_read",
  description:
    "Fetches a URL and returns readable content as markdown. " +
    "HTML is converted to markdown; JSON, YAML, TOML, XML are returned as fenced code blocks. " +
    "Binary/media/archive/PDF downloads are rejected. " +
    "For large pages, use `startChar`/`maxLength` to paginate. " +
    "Use `section` to extract content under a specific heading. " +
    "Use `readHeadings: true` to list all headings only. " +
    "Returns an error string if the URL is unreachable.",
  annotations: {
    readOnlyHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "URL to fetch.",
      },
      startChar: {
        type: "number",
        description: "Starting character position (default: 0)",
        minimum: 0,
      },
      maxLength: {
        type: "number",
        description: "Maximum number of characters to return",
        minimum: 1,
      },
      section: {
        type: "string",
        description: "Extract content under a specific heading.",
      },
      paragraphRange: {
        type: "string",
        description: "Return paragraph ranges (e.g., '1-5', '3', '10-').",
      },
      readHeadings: {
        type: "boolean",
        description: "Return only a list of headings instead of full content.",
      },
    },
    required: ["url"],
  },
};
