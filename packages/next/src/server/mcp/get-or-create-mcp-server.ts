import { McpServer } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp'

let mcpServer: McpServer | undefined

export const getOrCreateMcpServer = (projectPath: string) => {
  if (mcpServer) {
    return mcpServer
  }

  mcpServer = new McpServer({
    name: 'Next.js MCP Server',
    version: '0.1.0',
  })

  mcpServer.registerTool(
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

  return mcpServer
}
