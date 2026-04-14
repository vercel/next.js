/**
 * MCP tool for querying structured Next.js development logs.
 */
import type { McpServer } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp'
import { z } from 'next/dist/compiled/zod'
import { mcpTelemetryTracker } from '../mcp-telemetry-tracker'
import { getLogStream } from '../../dev/log-stream'

export function registerGetLogsTool(server: McpServer) {
  server.registerTool(
    'get_logs',
    {
      description:
        'Query structured Next.js development logs. Supports filtering by level, source, scope, and time range.',
      inputSchema: {
        limit: z
          .number()
          .optional()
          .describe('Maximum number of logs to return (default 100)'),
        since: z
          .number()
          .optional()
          .describe('Unix timestamp (ms) to filter logs from'),
        level: z
          .enum(['debug', 'info', 'warn', 'error'])
          .optional()
          .describe('Filter by log level'),
        source: z
          .enum(['system', 'userland', 'browser'])
          .optional()
          .describe('Filter by log source'),
        scope: z
          .string()
          .optional()
          .describe('Filter by scope (e.g., "request", "console", "compile")'),
      },
    },
    async (args: {
      limit?: number
      since?: number
      level?: string
      source?: string
      scope?: string
    }) => {
      mcpTelemetryTracker.recordToolCall('mcp/get_logs')

      try {
        const logStream = getLogStream()
        const limit = args.limit || 100

        // Fetch all available logs, then filter, then take the last N.
        // This ensures we return up to `limit` matching logs rather than
        // filtering a pre-sliced window.
        let logs = args.since ? logStream.since(args.since) : logStream.all()

        if (args.level || args.source || args.scope) {
          logs = logs.filter(
            (log) =>
              (!args.level || log.level === args.level) &&
              (!args.source || log.source === args.source) &&
              (!args.scope || log.scope === args.scope)
          )
        }

        logs = logs.slice(-limit)

        const formattedLogs = logs.map((log) => {
          const timestamp = new Date(log.ts).toISOString()
          const parts = [
            `[${timestamp}]`,
            `[${log.level.toUpperCase()}]`,
            log.scope ? `[${log.scope}]` : '',
            log.message,
          ]
          return parts.filter(Boolean).join(' ')
        })

        const stats = logStream.stats()
        const summary = `Showing ${formattedLogs.length} logs (buffer: ${stats.count}/${stats.capacity})\n\n`

        return {
          content: [
            {
              type: 'text',
              text: summary + formattedLogs.join('\n'),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error querying logs: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }
      }
    }
  )
}
