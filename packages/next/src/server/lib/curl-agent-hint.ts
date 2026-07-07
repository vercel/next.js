import type { IncomingMessage, ServerResponse } from 'http'

/**
 * Detects command-line HTTP clients (curl, wget, HTTPie, language standard-
 * library clients, …) by their User-Agent. Real browsers and Next.js's own
 * internal fetches are intentionally not matched.
 */
export function isCliHttpClient(userAgent: string | undefined): boolean {
  if (!userAgent) return false
  return /(?:^|[^a-z])(curl|wget|httpie|python-requests|libwww-perl|go-http-client|node-fetch|okhttp)(?:[^a-z]|$)/i.test(
    userAgent
  )
}

const STATIC_ASSET_RE = /\.[a-z0-9]+$/i

/**
 * Whether this request is a top-level HTML page navigation (as opposed to a
 * framework asset, API route, RSC fetch, or a static file).
 */
function isPageNavigation(req: IncomingMessage): boolean {
  if (req.method !== 'GET') return false
  const pathOnly = (req.url || '/').split('?')[0]
  if (
    pathOnly.startsWith('/_next') ||
    pathOnly.startsWith('/__next') ||
    pathOnly.startsWith('/api/') ||
    STATIC_ASSET_RE.test(pathOnly)
  ) {
    return false
  }
  const accept = (req.headers['accept'] as string) || ''
  return accept === '' || accept.includes('text/html') || accept.includes('*/*')
}

/**
 * Builds the agent-facing hint document served to CLI clients. It explains that
 * the route renders browser-only state curl cannot observe, and points to the
 * browser-capable tool the agent should use instead.
 */
export function buildCurlAgentHint(
  pathOnly: string,
  url: string,
  userAgent: string
): string {
  const safeUa = String(userAgent).replace(/[<>]/g, '')
  return [
    '<!-- NEXT.JS AGENT HINT: curl cannot observe this route. Use the next-browser tool. -->',
    '<!doctype html>',
    '<html><head><meta charset="utf-8"><title>Next.js dev server — agent hint</title></head>',
    '<body>',
    '<h1>This Next.js route renders browser-only state — curl cannot observe it.</h1>',
    `<p>You requested <code>${pathOnly}</code> with a command-line HTTP client (User-Agent: <code>${safeUa}</code>).</p>`,
    '<p>This dev route’s visible content is produced by client components, hydration, effects, and client-side navigation. An HTTP client like curl receives only the pre-hydration server skeleton (for example a "Loading…" placeholder), so <strong>any conclusion you draw from this response about what the page shows to a user will be wrong.</strong></p>',
    '<h2>Do this instead</h2>',
    '<p>Use the Next.js agent browser, which drives a real browser and returns the hydrated DOM:</p>',
    `<pre>next-browser ${url}</pre>`,
    '<p>Or invoke the <code>next-dev-loop</code> skill. Do not curl this route again — re-running curl will keep returning this same hint, not the page content.</p>',
    '</body></html>',
    '',
  ].join('\n')
}

/**
 * When a CLI HTTP client requests an app page in development, respond with an
 * agent-facing hint instead of the browser-only HTML it cannot observe, and
 * return `true` to signal the request was handled (short-circuited).
 *
 * Prototype gate: only active in dev with `NEXT_CURL_AGENT_HINT=1`. A shipped
 * version would move this behind a `next.config` / devIndicators option.
 */
export function maybeSendCurlAgentHint(
  req: IncomingMessage,
  res: ServerResponse,
  opts: { dev?: boolean }
): boolean {
  if (!opts.dev || process.env.NEXT_CURL_AGENT_HINT !== '1') return false
  const ua = req.headers['user-agent']
  if (!isCliHttpClient(ua) || !isPageNavigation(req)) return false

  const pathOnly = (req.url || '/').split('?')[0]
  const url = `http://${req.headers.host || 'localhost'}${req.url || ''}`
  res.statusCode = 200
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.setHeader('x-nextjs-agent-hint', '1')
  res.end(buildCurlAgentHint(pathOnly, url, ua || ''))
  return true
}
