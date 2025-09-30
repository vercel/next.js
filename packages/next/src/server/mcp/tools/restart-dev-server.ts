import type { McpServer } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp'
import { RESTART_EXIT_CODE } from '../../lib/utils'

export function registerRestartDevServerTool(server: McpServer) {
  server.registerTool(
    'restart_dev_server',
    {
      description:
        'Restart the Next.js development server. This will trigger a server restart with the same configuration.',
      inputSchema: {},
    },
    async (_request) => {
      try {
        // Default values for restart
        const port = process.env.PORT

        // Log the restart action
        console.log(`[MCP] Restarting dev server on port ${port}...`)

        // Try to use the HTTP endpoint first (like the dev overlay does)
        try {
          const url = `http://localhost:${port}/__nextjs_restart_dev`

          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
          })

          if (response.ok) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Dev server restart initiated via HTTP endpoint. The server will restart shortly.`,
                },
              ],
            }
          } else {
            console.warn(
              `[MCP] HTTP restart failed with status ${response.status}, falling back to process exit`
            )
          }
        } catch (httpError) {
          console.warn(
            `[MCP] HTTP restart failed: ${httpError}, falling back to process exit`
          )
        }

        // Fallback: Use the same mechanism as the dev overlay
        // This will cause the process to exit with RESTART_EXIT_CODE
        // which will be caught by the parent process and restart the server
        setTimeout(() => {
          process.exit(RESTART_EXIT_CODE)
        }, 100) // Small delay to allow response to be sent

        return {
          content: [
            {
              type: 'text',
              text: `Dev server restart initiated via process exit. The server will restart shortly.`,
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error restarting dev server: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }
      }
    }
  )
}
