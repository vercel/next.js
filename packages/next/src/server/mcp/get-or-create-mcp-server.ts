import { McpServer } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp'
import { registerGetProjectPathTool } from './tools/get-project-path'
import { registerGetErrorsTool } from './tools/get-errors'
import { registerGetPageMetadataTool } from './tools/get-page-metadata'
import { registerGetLogsTool } from './tools/get-logs'
import type { HmrMessageSentToBrowser } from '../dev/hot-reloader-types'

let mcpServer: McpServer | undefined

export const getOrCreateMcpServer = (
  projectPath: string,
  distDir: string,
  sendHmrMessage: (message: HmrMessageSentToBrowser) => void,
  getActiveConnectionCount: () => number
) => {
  if (mcpServer) {
    return mcpServer
  }

  mcpServer = new McpServer({
    name: 'Next.js MCP Server',
    version: '0.1.0',
  })

  registerGetProjectPathTool(mcpServer, projectPath)
  registerGetErrorsTool(mcpServer, sendHmrMessage, getActiveConnectionCount)
  registerGetPageMetadataTool(
    mcpServer,
    sendHmrMessage,
    getActiveConnectionCount
  )
  registerGetLogsTool(mcpServer, distDir)

  return mcpServer
}
