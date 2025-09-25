import type { McpServer } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp'

export function registerGetProjectPathTool(
  server: McpServer,
  projectPath: string
) {
  server.registerTool(
    'get_project_path',
    {
      description:
        'Returns the absolute path of the root directory for this Next.js project.',
      inputSchema: {},
    },
    async (_request) => {
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

        return {
          content: [
            {
              type: 'text',
              text: projectPath,
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
