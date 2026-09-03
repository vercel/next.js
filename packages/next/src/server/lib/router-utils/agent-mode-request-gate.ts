import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Agent mode: intercept raw CLI HTTP clients (curl/wget) fetching app routes.
 *
 * Agents verify changes by curling routes and reading the status code, which
 * tells them almost nothing about what actually failed (and rendered HTML is
 * a poor error report). In agent mode we intercept those requests with a JSON
 * response that names the structured alternatives — the `/_next/agent` index
 * and the MCP endpoint — plus an escape hatch header for when the raw
 * response really is wanted.
 *
 * Never intercepts `/_next/*` or `/__nextjs*` paths, so the MCP endpoint,
 * the agent index, and dev internals stay reachable with plain curl.
 */

const CLI_CLIENT_UA_RE = /^(?:curl|wget)\//i

/**
 * Escape-hatch header. Any value disables interception for the request.
 * Security note: this header only bypasses the agent-mode interception below
 * (dev-only, opt-in); it grants nothing else and is ignored everywhere else.
 */
export const AGENT_MODE_BYPASS_HEADER = 'x-nextjs-agent'

export function interceptCliRequestInAgentMode(
  req: IncomingMessage,
  res: ServerResponse
): boolean {
  const userAgent = req.headers['user-agent']
  if (!userAgent || !CLI_CLIENT_UA_RE.test(userAgent)) {
    return false
  }
  if (req.headers[AGENT_MODE_BYPASS_HEADER] !== undefined) {
    return false
  }

  const { pathname } = new URL(req.url || '', 'http://n')
  if (pathname.startsWith('/_next') || pathname.startsWith('/__nextjs')) {
    return false
  }

  const appUrl = process.env.__NEXT_PRIVATE_ORIGIN ?? ''

  res.statusCode = 403
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('x-nextjs-agent-mode', '1')
  res.end(
    JSON.stringify(
      {
        blocked: true,
        reason:
          'This Next.js dev server is running in agent mode (experimental.agentMode). ' +
          'Raw CLI fetches of rendered routes are intercepted: a status code or rendered HTML ' +
          'is a poor way to check whether the app actually works.',
        instead: {
          cli: `npx next experimental-agent-dev get_errors — current build/runtime errors as JSON. Run npx next experimental-agent-dev (no args) to see all tools (compile_route, get_routes, get_logs, ...).`,
          index: `GET ${appUrl}/_next/agent — JSON index of this dev server (project, MCP endpoint, tools)`,
          mcp: `${appUrl}/_next/mcp — the same tools as an MCP endpoint, for MCP-capable clients`,
        },
        escapeHatch: `Repeat the request with the header '${AGENT_MODE_BYPASS_HEADER}: raw' to fetch the route anyway, e.g. curl -H '${AGENT_MODE_BYPASS_HEADER}: raw' ${appUrl}${pathname}`,
      },
      null,
      2
    )
  )
  return true
}
