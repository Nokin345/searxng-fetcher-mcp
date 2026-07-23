import { fetch as undiciFetch } from "undici";

export interface SearchArgs {
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
}

export interface SearchResult {
  title: string;
  content: string;
  url: string;
  score?: number;
  engine?: string;
  engines?: string[];
  category?: string;
  publishedDate?: string;
}

export async function performWebSearch(args: SearchArgs, searxngUrl: string): Promise<string> {
  const params = new URLSearchParams();
  params.set("q", args.query);

  if (args.pageno && args.pageno > 1) {
    params.set("pageno", String(args.pageno));
  }
  if (args.time_range) {
    params.set("time_range", args.time_range);
  }
  if (args.language) {
    params.set("language", args.language);
  }
  if (args.safesearch) {
    params.set("safesearch", args.safesearch);
  }
  if (args.min_score !== undefined) {
    params.set("min_score", String(args.min_score));
  }
  if (args.num_results) {
    params.set("num_results", String(args.num_results));
  }
  if (args.categories) {
    params.set("categories", args.categories);
  }
  if (args.engines) {
    params.set("engines", args.engines);
  }
  params.set("format", "json");

  const url = `${searxngUrl}/search?${params.toString()}`;
  const timeoutMs = parseInt(process.env.SEARCH_TIMEOUT_MS || "10000", 10);

  let resp: any;
  try {
    resp = await undiciFetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "searxng-fetcher-mcp/1.0",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err: any) {
    if (err.name === "TimeoutError") {
      return `Error: SearXNG search timed out after ${timeoutMs}ms`;
    }
    return `Error: Failed to reach SearXNG at ${searxngUrl}: ${err.message}`;
  }

  if (!resp.ok) {
    return `Error: SearXNG returned status ${resp.status}: ${resp.statusText}`;
  }

  let data: any;
  try {
    data = await resp.json();
  } catch (err: any) {
    return `Error: SearXNG returned invalid JSON: ${err.message}`;
  }

  const results: SearchResult[] = (data.results || []).map((r: any) => ({
    title: r.title || "",
    content: r.content || "",
    url: r.url || "",
    score: r.score,
    engine: r.engine,
    engines: r.engines,
    category: r.category,
    publishedDate: r.publishedDate,
  }));

  if (args.response_format === "json") {
    return JSON.stringify({
      query: args.query,
      number_of_results: data.number_of_results || results.length,
      results: results,
      suggestions: data.suggestions || [],
      corrections: data.corrections || [],
      answers: data.answers || [],
    }, null, 2);
  }

  return formatTextResults(results, args.query, data);
}

function formatTextResults(results: SearchResult[], query: string, data: any): string {
  if (results.length === 0) {
    let output = `Search results for "${query}"\n\nNo results found.\n`;
    if (data.suggestions && data.suggestions.length > 0) {
      output += `\nSuggestions: ${data.suggestions.join(", ")}\n`;
    }
    if (data.answers && data.answers.length > 0) {
      output += `\nAnswers: ${data.answers.join("\n")}\n`;
    }
    if (data.corrections && data.corrections.length > 0) {
      output += `\nCorrections: ${data.corrections.join(", ")}\n`;
    }
    if (data.infoboxes && data.infoboxes.length > 0) {
      output += `\nInfoboxes:\n`;
      for (const infobox of data.infoboxes) {
        output += `${infobox.infobox}: ${infobox.content || ""}\n`;
      }
    }
    return output;
  }

  let output = `Search results for "${query}"\n`;
  output += `Found ${results.length} result(s)\n\n`;

  if (data.answers && data.answers.length > 0) {
    output += `Answers:\n${data.answers.map((a: string) => `  - ${a}`).join("\n")}\n\n`;
  }

  if (data.corrections && data.corrections.length > 0) {
    output += `Corrections: ${data.corrections.join(", ")}\n\n`;
  }

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    output += `${i + 1}. ${r.title}\n`;
    output += `   URL: ${r.url}\n`;
    if (r.score !== undefined) {
      output += `   Score: ${r.score.toFixed(2)}\n`;
    }
    if (r.publishedDate) {
      output += `   Published: ${r.publishedDate}\n`;
    }
    if (r.engine) {
      output += `   Engine: ${r.engine}\n`;
    }
    output += `   Snippet: ${r.content}\n`;
    output += "\n";
  }

  return output;
}
