import type { McpServer } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp'
import { mcpTelemetryTracker } from '../mcp-telemetry-tracker'

export function registerGetProjectMetadataTool(
  server: McpServer,
  projectPath: string,
  getDevServerUrl: () => string | undefined
) {
  server.registerTool(
    'get_project_metadata',
    {
      description:
        'Returns the the metadata of this Next.js project, including project path, dev server URL, etc.',
      inputSchema: {},
    },
    async (_request) => {
      // Track telemetry
      mcpTelemetryTracker.recordToolCall('mcp/get_project_metadata')

      try {
        if (!projectPath) {
          return {
            content: [
              {
                type: 'text',
                text: 'Unable to determine the absolute path of the Next.js project.',
              },
            ],
          }
        }

        const devServerUrl = getDevServerUrl()

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                projectPath,
                devServerUrl,
              }),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }
      }
    }
  )
}
