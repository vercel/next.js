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
      mcpTelemetryTracker.recordToolCall('mcp/get_project_metadata')
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              await getProjectMetadata(projectPath, getDevServerUrl)
            ),
          },
        ],
      }
    }
  )
}

export async function getProjectMetadata(
  projectPath: string,
  getDevServerUrl: () => string | undefined
) {
  try {
    if (!projectPath) {
      return {
        error: 'Unable to determine the absolute path of the Next.js project.',
      }
    }
    const devServerUrl = getDevServerUrl()
    return {
      projectPath,
      devServerUrl,
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
