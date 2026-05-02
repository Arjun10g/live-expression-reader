// Cloudflare Worker proxy for the "Why?" feature.
// Holds the Anthropic API key as a Worker secret. The browser bundle never sees it.
//
// Deploy:
//   wrangler secret put ANTHROPIC_API_KEY
//   wrangler deploy
//
// Add an "HTTP Rate Limiting" rule in the Cloudflare dashboard for this Worker
// route to cap per-IP calls (e.g. 30 requests / 5 minutes). Don't rely on
// per-IP code-level counters with KV; the dashboard rule is free and lower latency.

export interface Env {
  ANTHROPIC_API_KEY: string;
  // Comma-separated list of allowed Origins, e.g.
  // "https://your-name-expression.hf.space,http://localhost:5173".
  ALLOWED_ORIGIN: string;
}

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
// Generous; keeps the upstream from getting hammered by accident.
const MAX_INPUT_BYTES = 16 * 1024;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get("origin") ?? "";
    const allowed = env.ALLOWED_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean);
    const corsOrigin = allowed.includes(origin) ? origin : "null";

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(corsOrigin) });
    }
    if (req.method !== "POST") {
      return text("method not allowed", 405, corsHeaders(corsOrigin));
    }
    if (!allowed.includes(origin)) {
      return text("origin not allowed", 403, corsHeaders("null"));
    }

    const ct = req.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) {
      return text("content-type must be application/json", 415, corsHeaders(corsOrigin));
    }

    const raw = await req.text();
    if (raw.length > MAX_INPUT_BYTES) {
      return text("payload too large", 413, corsHeaders(corsOrigin));
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return text("invalid json", 400, corsHeaders(corsOrigin));
    }

    // Light validation: only allow the shape we expect from the frontend so
    // callers can't smuggle through arbitrary tool / system prompt overrides.
    if (typeof body !== "object" || body === null) {
      return text("body must be an object", 400, corsHeaders(corsOrigin));
    }
    const safe = sanitizeRequest(body as Record<string, unknown>);
    if (!safe) {
      return text("rejected: unexpected fields", 400, corsHeaders(corsOrigin));
    }

    const upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(safe),
    });

    // Pass through the streaming body unchanged.
    const headers = new Headers(corsHeaders(corsOrigin));
    headers.set("content-type", upstream.headers.get("content-type") ?? "application/json");
    headers.set("cache-control", "no-cache");
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};

function corsHeaders(origin: string): Record<string, string> {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    "vary": "origin",
  };
}

function text(body: string, status: number, headers: Record<string, string>): Response {
  return new Response(body, { status, headers: { ...headers, "content-type": "text/plain" } });
}

interface SafeRequest {
  model: string;
  max_tokens: number;
  stream: boolean;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

function sanitizeRequest(input: Record<string, unknown>): SafeRequest | null {
  const model = input["model"];
  const maxTokens = input["max_tokens"];
  const stream = input["stream"];
  const messages = input["messages"];

  if (typeof model !== "string") return null;
  if (typeof maxTokens !== "number" || maxTokens > 1024) return null;
  if (typeof stream !== "boolean") return null;
  if (!Array.isArray(messages) || messages.length === 0) return null;

  const safeMessages: SafeRequest["messages"] = [];
  for (const m of messages) {
    if (typeof m !== "object" || m === null) return null;
    const role = (m as Record<string, unknown>)["role"];
    const content = (m as Record<string, unknown>)["content"];
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string" || content.length > 8000) return null;
    safeMessages.push({ role, content });
  }

  return { model, max_tokens: maxTokens, stream, messages: safeMessages };
}
