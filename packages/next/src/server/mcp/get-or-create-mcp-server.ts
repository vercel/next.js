import { McpServer } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp'
import { registerGetProjectMetadataTool } from './tools/get-project-metadata'
import { registerGetErrorsTool } from './tools/get-errors'
import { registerGetPageMetadataTool } from './tools/get-page-metadata'
import { registerGetLogsTool } from './tools/get-logs'
import { registerGetActionByIdTool } from './tools/get-server-action-by-id'
import type { HmrMessageSentToBrowser } from '../dev/hot-reloader-types'
import { mcpTelemetryTracker } from './mcp-telemetry-tracker'
import type { McpToolUsage } from './mcp-telemetry-tracker'

export interface McpServerOptions {
  projectPath: string
  distDir: string
  sendHmrMessage: (message: HmrMessageSentToBrowser) => void
  getActiveConnectionCount: () => number
  getDevServerUrl: () => string | undefined
}

let mcpServer: McpServer | undefined

export const getOrCreateMcpServer = (options: McpServerOptions) => {
  if (mcpServer) {
    return mcpServer
  }

  mcpServer = new McpServer({
    name: 'Next.js MCP Server',
    version: '0.1.0',
  })

  registerGetProjectMetadataTool(
    mcpServer,
    options.projectPath,
    options.getDevServerUrl
  )
  registerGetErrorsTool(
    mcpServer,
    options.sendHmrMessage,
    options.getActiveConnectionCount
  )
  registerGetPageMetadataTool(
    mcpServer,
    options.sendHmrMessage,
    options.getActiveConnectionCount
  )
  registerGetLogsTool(mcpServer, options.distDir)
  registerGetActionByIdTool(mcpServer, options.distDir)

  return mcpServer
}

/**
 * Get MCP tool usage telemetry
 */
export function getMcpTelemetryUsage(): McpToolUsage[] {
  return mcpTelemetryTracker.getUsages()
}

/**
 * Reset MCP telemetry tracker
 */
export function resetMcpTelemetry(): void {
  mcpTelemetryTracker.reset()
}
