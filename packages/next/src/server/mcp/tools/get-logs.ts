/**
 * MCP tool for getting the path to the Next.js development log file.
 *
 * This tool returns the path to the {nextConfig.distDir}/logs/next-development.log file
 * that contains browser console logs and other development information.
 */
import type { McpServer } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp'
import { stat } from 'fs/promises'
import { join } from 'path'
import { mcpTelemetryTracker } from '../mcp-telemetry-tracker'

export function registerGetLogsTool(server: McpServer, distDir: string) {
  server.registerTool(
    'get_logs',
    {
      description:
        'Get the path to the Next.js development log file. Returns the file path so the agent can read the logs directly.',
    },
    async () => {
      mcpTelemetryTracker.recordToolCall('mcp/get_logs')
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(await getDevelopmentLogs(distDir)),
          },
        ],
      }
    }
  )
}

export async function getDevelopmentLogs(distDir: string) {
  try {
    const logFilePath = join(distDir, 'logs', 'next-development.log')
    // Check if the log file exists
    try {
      await stat(logFilePath)
    } catch (error) {
      return {
        error: `Log file not found at ${logFilePath}.`,
      }
    }
    return {
      logFilePath,
    }
  } catch (error) {
    return {
      error: `Error getting log file path: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
