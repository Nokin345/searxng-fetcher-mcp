import { fetch as undiciFetch } from "undici";
import { NodeHtmlMarkdown } from "node-html-markdown";

export interface UrlReadArgs {
  url: string;
  startChar?: number;
  maxLength?: number;
  section?: string;
  paragraphRange?: string;
  readHeadings?: boolean;
}

const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;
const DEFAULT_MAX_CONTENT_LENGTH_BYTES = 5 * 1024 * 1024;

const BINARY_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/octet-stream",
  "application/zip",
  "application/x-zip-compressed",
  "application/gzip",
  "application/x-gzip",
  "application/x-tar",
  "application/x-7z-compressed",
  "application/x-rar-compressed",
  "application/x-bzip",
  "application/x-bzip2",
  "application/x-xz",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/ogg",
]);

function classifyContentType(contentType: string | null) {
  if (!contentType) return "generic";

  const ct = contentType.split(";")[0].toLowerCase().trim();

  if (ct.includes("text/html") || ct.includes("application/xhtml")) return "html";
  if (ct.includes("application/json")) return "json";
  if (ct.includes("text/plain") || ct.includes("text/xml") || ct.includes("application/xml")) return "text-plain";
  if (ct.includes("yaml") || ct.includes("text/yaml")) return "yaml";
  if (ct.includes("toml") || ct.includes("text/toml")) return "toml";

  if (BINARY_CONTENT_TYPES.has(ct)) return "binary";

  return "generic";
}

function isRedirect(status: number): boolean {
  return REDIRECT_STATUS_CODES.has(status);
}

function applyPagination(content: string, startChar: number = 0, maxLength?: number): string {
  if (startChar >= content.length) return "";
  const end = maxLength ? Math.min(content.length, startChar + maxLength) : content.length;
  return content.slice(startChar, end);
}

function extractSection(markdown: string, sectionHeading: string): string {
  const lines = markdown.split("\n");
  const headingLower = sectionHeading.toLowerCase();

  let startIndex = -1;
  let currentLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^#{1,6}\s/.test(line) && line.toLowerCase().includes(headingLower)) {
      startIndex = i;
      currentLevel = line.match(/^#+/)![0].length;
      break;
    }
  }

  if (startIndex === -1) return "";

  let endIndex = lines.length;
  for (let i = startIndex + 1; i < lines.length; i++) {
    const match = lines[i].match(/^#+/);
    if (match && match[0].length <= currentLevel) {
      endIndex = i;
      break;
    }
  }

  return lines.slice(startIndex, endIndex).join("\n");
}

function extractParagraphRange(markdown: string, range: string): string {
  const paragraphs = markdown.split("\n\n").filter((p) => p.trim().length > 0);

  const match = range.match(/^(\d+)(?:-(\d*))?$/);
  if (!match) return "";

  const start = parseInt(match[1]) - 1;
  const endStr = match[2];

  if (start < 0 || start >= paragraphs.length) return "";

  if (endStr === undefined) return paragraphs[start] || "";
  if (endStr === "") return paragraphs.slice(start).join("\n\n");

  const end = parseInt(endStr);
  return paragraphs.slice(start, end).join("\n\n");
}

function extractHeadings(markdown: string): string {
  const headings = markdown.split("\n").filter((line) => /^#{1,6}\s/.test(line));
  return headings.length > 0 ? headings.join("\n") : "No headings found.";
}

export async function fetchUrl(url: string, args: UrlReadArgs): Promise<string> {
  const timeoutMs = parseInt(process.env.FETCH_TIMEOUT_MS || "10000", 10);
  const maxContentLength = parseInt(process.env.URL_READ_MAX_CONTENT_BYTES || String(DEFAULT_MAX_CONTENT_LENGTH_BYTES), 10);
  const userAgent = process.env.URL_READER_USER_AGENT || "searxng-fetcher-mcp/1.0";

  let redirectCount = 0;
  let finalUrl = url;
  let html = "";
  let contentType = "";

  while (redirectCount <= MAX_REDIRECTS) {
    let resp: any;
    try {
      resp = await undiciFetch(finalUrl, {
        method: "GET",
        headers: {
          Accept: "*/*",
          "User-Agent": userAgent,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err: any) {
      if (err.name === "TimeoutError") {
        return `Error: URL read timed out after ${timeoutMs}ms for ${finalUrl}`;
      }
      return `Error: Failed to fetch ${finalUrl}: ${err.message}`;
    }

    // undici's fetch() returns a web Response: use status/statusText and
    // Headers.get(). The previous `statusCode`/`headers["content-type"]` reads
    // were undefined, so errors came back as "status undefined: undefined",
    // every read reported "Content-Type: unknown", and the binary/PDF rejection
    // below was unreachable (a PDF came back as ~5MB of raw bytes).
    if (isRedirect(resp.status) && resp.headers.get("location")) {
      redirectCount++;
      try {
        finalUrl = new URL(resp.headers.get("location") as string, finalUrl).href;
      } catch {
        return `Error: Invalid redirect URL: ${resp.headers.get("location")}`;
      }
      continue;
    }

    if (!resp.ok) {
      return `Error: ${finalUrl} returned status ${resp.status}: ${resp.statusText}`;
    }

    contentType = resp.headers.get("content-type") || "";

    const body = resp.body;
    if (!body) {
      return `Error: ${url} returned empty body (content-type: ${contentType || "unknown"})`;
    }

    const chunks: Buffer[] = [];
    let totalSize = 0;

    const reader = body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalSize += value.length;
      if (totalSize > maxContentLength) break;

      chunks.push(Buffer.from(value));
    }

    const contentBuffer = Buffer.concat(chunks);
    html = contentBuffer.toString("utf-8");
    break;
  }

  if (html.trim().length === 0) {
    return `Error: ${url} returned empty content (content-type: ${contentType || "unknown"})`;
  }

  const type = classifyContentType(contentType);

  let content: string;

  switch (type) {
    case "html": {
      const nhm = new NodeHtmlMarkdown();
      content = nhm.translate(html);
      break;
    }
    case "json": {
      let parsed: any;
      try {
        parsed = JSON.parse(html);
        content = "```json\n" + JSON.stringify(parsed, null, 2) + "\n```";
      } catch {
        content = "```json\n" + html.substring(0, 10000) + "\n```";
      }
      break;
    }
    case "yaml":
    case "toml":
    case "text-plain":
    case "generic": {
      if (type === "generic" && !html.trim().startsWith("<")) {
        content = "```\n" + html.substring(0, maxContentLength) + "\n```";
      } else if (type === "generic") {
        const nhm = new NodeHtmlMarkdown();
        content = nhm.translate(html);
      } else {
        content = "```\n" + html.substring(0, maxContentLength) + "\n```";
      }
      break;
    }
    case "binary": {
      return `Error: Binary content (${contentType || "unknown"}) is not supported for direct reading.`;
    }
    default: {
      content = "```\n" + html.substring(0, maxContentLength) + "\n```";
    }
  }

  const title = extractTitle(html);
  let output = `URL: ${url}\n`;
  output += `Content-Type: ${contentType || "unknown"}\n`;
  output += `Title: ${title}\n\n`;

  if (args.readHeadings) {
    output += extractHeadings(content);
  } else {
    if (args.section) {
      content = extractSection(content, args.section);
      if (content === "") {
        output += `Section "${args.section}" not found.`;
        return output;
      }
    }

    if (args.paragraphRange) {
      content = extractParagraphRange(content, args.paragraphRange);
      if (content === "") {
        output += `Paragraph range "${args.paragraphRange}" is invalid or out of bounds.`;
        return output;
      }
    }

    if (args.startChar !== undefined || args.maxLength) {
      content = applyPagination(content, args.startChar, args.maxLength);
    }

    output += content;
  }

  return output;
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? match[1].trim() : "Untitled";
}
