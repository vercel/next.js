/**
 * MCP tool for retrieving Turbopack compilation issues from the Next.js dev server.
 *
 * This tool provides fresh compilation issues (errors, warnings, all severities)
 * grouped by route, for all routes that have been compiled in the current dev session.
 *
 * Flow:
 *   MCP client → determine compiled routes from written entrypoints →
 *   look up Endpoint objects from currentEntrypoints →
 *   call endpoint.getIssues() (NAPI) for fresh issues →
 *   return JSON grouped by route.
 */
import type { McpServer } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp'
import type {
  AppRoute,
  Endpoint,
  Entrypoints,
  Issue,
  PageRoute,
} from '../../../build/swc/types'
import type { EntryKey } from '../../../shared/lib/turbopack/entry-key'
import { splitEntryKey } from '../../../shared/lib/turbopack/entry-key'
import { mcpTelemetryTracker } from '../mcp-telemetry-tracker'

export interface GetCompilationIssuesOptions {
  getCurrentEntrypoints: () => Entrypoints
  /**
   * Only the keys are used to determine which routes have been compiled;
   * the value type is intentionally opaque.
   */
  getWrittenEntrypoints: () => ReadonlyMap<EntryKey, unknown>
}

/**
 * Returns the primary endpoint for a route entry.
 *
 * For page-rendering routes (`app-page`, `page`), `htmlEndpoint` is used because
 * it is the primary compilation unit that aggregates issues from both client and
 * server components. For API-style routes (`app-route`, `page-api`), `endpoint`
 * is the only compilation unit.
 */
function getRouteEndpoint(route: AppRoute | PageRoute): Endpoint | null {
  switch (route.type) {
    case 'app-page':
    case 'page':
      return route.htmlEndpoint
    case 'app-route':
    case 'page-api':
      return route.endpoint
    default:
      return null
  }
}

export function registerGetCompilationIssuesTool(
  server: McpServer,
  options: GetCompilationIssuesOptions
) {
  server.registerTool(
    'get_compilation_issues',
    {
      description:
        'Get current Turbopack compilation issues (errors, warnings) for all routes that have been compiled in the current dev session, grouped by route',
      inputSchema: {},
    },
    async (_request) => {
      mcpTelemetryTracker.recordToolCall('mcp/get_compilation_issues')

      try {
        const entrypoints = options.getCurrentEntrypoints()
        const writtenEntrypoints = options.getWrittenEntrypoints()

        // Determine compiled routes from written entrypoints.
        // Each EntryKey is JSON like {"type":"app","side":"server","page":"/page"}.
        // Extract unique page names and look them up in currentEntrypoints.
        const compiledPages = new Set<string>()
        for (const key of writtenEntrypoints.keys()) {
          const { page } = splitEntryKey(key)
          compiledPages.add(page)
        }

        if (compiledPages.size === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  routes: {},
                  message: 'No routes have been compiled yet.',
                }),
              },
            ],
          }
        }

        const routes: Record<string, { issues: Issue[] }> = {}

        await Promise.all(
          Array.from(compiledPages).map(async (page) => {
            const routeEntry =
              entrypoints.app.get(page) ?? entrypoints.page.get(page)
            if (!routeEntry) return

            const endpoint = getRouteEndpoint(routeEntry)
            if (!endpoint) return

            try {
              const result = await endpoint.getIssues()
              routes[page] = { issues: result.issues }
            } catch (err) {
              console.error(
                `[MCP get_compilation_issues] Error getting issues for route ${page}:`,
                err
              )
            }
          })
        )

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ routes }, null, 2),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
        }
      }
    }
  )
}
