/**
 * MCP tool for getting compilation issues from all routes via Turbopack.
 *
 * Unlike get_errors (which requires a browser session and reflects the runtime
 * error overlay), this tool builds the module graph for every endpoint and
 * collects Turbopack issues directly — no browser needed. Covers
 * module-not-found, syntax errors, and other transform failures across all
 * routes.
 */
import type { McpServer } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp'
import type { Project } from '../../../build/swc/types'
import { mcpTelemetryTracker } from '../mcp-telemetry-tracker'
import { formatCompilationIssues } from './utils/format-compilation-issues'

export function registerGetCompilationIssuesTool(
  server: McpServer,
  getProject: () => Project | undefined
) {
  server.registerTool(
    'get_compilation_issues',
    {
      description:
        'Build the module graph for all routes and return all compilation issues (resolve errors, missing modules, transform errors, etc.). Does not require a browser session. Covers all routes proactively.',
      inputSchema: {},
    },
    async () => {
      mcpTelemetryTracker.recordToolCall('mcp/get_compilation_issues')

      try {
        const project = getProject()
        if (!project) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error:
                    'Turbopack project is not available. This tool requires the Turbopack bundler.',
                }),
              },
            ],
          }
        }

        const { issues } = await project.getAllCompilationIssues()
        const formattedIssues = formatCompilationIssues(issues)

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ issues: formattedIssues }),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
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
