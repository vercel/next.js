import type { McpServer } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp'
import type { Project } from '../../../build/swc/types'
import { mcpTelemetryTracker } from '../mcp-telemetry-tracker'

export function registerGetCompilationIssuesTool(
  server: McpServer,
  getProject: () => Project | undefined
) {
  server.registerTool(
    'get_compilation_issues',
    {
      description:
        'Build the module graph for all routes and return all compilation issues ' +
        '(resolve errors, missing modules, transform errors, etc.). ' +
        'Does not require a browser session. Covers all routes proactively.',
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
                type: 'text' as const,
                text: JSON.stringify({
                  error:
                    'Turbopack project is not available. This tool requires the Turbopack bundler.',
                }),
              },
            ],
          }
        }

        const result = await project.getAllCompilationIssues()

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                issues: result.issues,
                diagnostics: result.diagnostics,
              }),
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
