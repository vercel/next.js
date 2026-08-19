import type { ServerResponse, IncomingMessage } from 'http'
import { isAgentModeEnabled } from '../lib/agent-mode'

/**
 * `GET /_next/agent`: a machine-readable index of this dev server for AI
 * coding agents (experimental.agentMode).
 *
 * Plain-curl consumable on purpose: agents that never complete an MCP
 * handshake can still identify which project a port belongs to (relevant
 * when several dev servers run at once) and learn what the MCP endpoint
 * offers before wiring it up.
 */
export function getAgentIndexMiddleware(options: {
  projectPath: string
  nextConfig: { experimental?: { agentMode?: boolean } }
  bundler: 'turbopack' | 'webpack'
  tools: string[]
  getDevServerUrl: () => string | undefined
  getActiveConnectionCount: () => number
}) {
  return async function (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): Promise<void> {
    const { pathname } = new URL(req.url || '', 'http://n')
    if (pathname !== '/_next/agent') {
      return next()
    }
    if (!(await isAgentModeEnabled(options.nextConfig))) {
      return next()
    }

    const appUrl = options.getDevServerUrl() ?? ''
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(
      JSON.stringify(
        {
          name: 'next-dev',
          agentMode: true,
          version: process.env.__NEXT_VERSION,
          project: options.projectPath,
          appUrl,
          pid: process.pid,
          bundler: options.bundler,
          // Runtime errors are collected from connected browsers; 0 means
          // only build/compile state is observable until a page is open.
          activeBrowserConnections: options.getActiveConnectionCount(),
          mcp: {
            url: `${appUrl}/_next/mcp`,
            transport: 'streamable-http',
            tools: options.tools,
          },
          hints: [
            'Several dev servers running? GET /_next/agent on each port returns its `project` path.',
            `Register the MCP endpoint with your client to use the tools, e.g. \`claude mcp add --transport http next-dev ${appUrl}/_next/mcp\`.`,
            "Raw curl/wget fetches of rendered routes are intercepted in agent mode; send header 'x-nextjs-agent: raw' to fetch anyway.",
          ],
        },
        null,
        2
      )
    )
  }
}
