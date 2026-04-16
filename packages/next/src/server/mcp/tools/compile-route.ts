/**
 * MCP tool for compiling a specific route via the on-demand entry handler.
 *
 * Triggers on-demand compilation so the route's assets are built without making an
 * HTTP request to the route. This is the same call path the dev server uses
 * when a route is first navigated to, making it useful for warming the module
 * graph, measuring compile time, or pre-compiling routes for memory
 * benchmarking without requiring live backends.
 */
import type { McpServer } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp'
import { mcpTelemetryTracker } from '../mcp-telemetry-tracker'
import type { FormattedIssue } from './utils/format-compilation-issues'
import z from 'next/dist/compiled/zod'

export function registerCompileRouteTool(
  server: McpServer,
  compileRoute: (opts: {
    page: string
    clientOnly: boolean
  }) => Promise<FormattedIssue[]>
) {
  server.registerTool(
    'compile_route',
    {
      description:
        'Compile a specific route (page or API route) without making an HTTP request. ' +
        'Triggers the same on-demand compilation the dev server uses when a route is first visited. ' +
        'Useful for warming up the module graph, measuring compile time, or pre-compiling routes for memory benchmarking. ' +
        'Returns { page, issues } on success where issues contains any compilation warnings or errors. ' +
        'Returns an error if the route does not exist.',
      inputSchema: {
        page: z
          .string()
          .describe(
            'The route specifier, e.g. "/", "/about", "/api/hello", "/blog/[slug]"'
          ),
      },
    },
    async ({ page }) => {
      mcpTelemetryTracker.recordToolCall('mcp/compile_route')
      try {
        // clientOnly: false ensures both server and client bundles are compiled,
        // matching what happens on a real page navigation.
        const issues = await compileRoute({ page, clientOnly: false })
        return {
          content: [{ type: 'text', text: JSON.stringify({ page, issues }) }],
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const notFound =
          error instanceof Error &&
          (error as NodeJS.ErrnoException).code === 'ENOENT'
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                notFound ? { page, notFound: true } : { page, error: message }
              ),
            },
          ],
        }
      }
    }
  )
}
