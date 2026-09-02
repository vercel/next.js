import type { McpServer } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp'
import z from 'next/dist/compiled/zod'
import {
  getRequestInsightsSnapshot,
  isRequestInsightsEnabled,
} from '../../lib/trace/request-insights'
import { mcpTelemetryTracker } from '../mcp-telemetry-tracker'

export function registerGetRequestInsightsTool(server: McpServer) {
  server.registerTool(
    'get_request_insights',
    {
      description:
        'Get recent App Router request insights captured by the local Next.js span recorder. Useful for debugging slow renders, server fetches, cache behavior, and request timelines without an external OTEL collector. Requires experimental.requestInsights.',
      inputSchema: {
        requestId: z.string().optional(),
        htmlRequestId: z.string().optional(),
      },
    },
    async (request) => {
      mcpTelemetryTracker.recordToolCall('mcp/get_request_insights')

      if (!isRequestInsightsEnabled()) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error:
                  'Request Insights is not enabled. Set experimental.requestInsights = true in next.config.js and restart next dev.',
              }),
            },
          ],
        }
      }

      const snapshot = getRequestInsightsSnapshot()
      const requests = snapshot.requests.filter((insight) => {
        return (
          (request.requestId === undefined ||
            insight.requestId === request.requestId) &&
          (request.htmlRequestId === undefined ||
            insight.htmlRequestId === request.htmlRequestId)
        )
      })

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ requests }, null, 2),
          },
        ],
      }
    }
  )
}
