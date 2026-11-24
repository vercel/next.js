import type { McpServer } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp'
import z from 'next/dist/compiled/zod'
import { summarizeRequestInsight } from '../../../shared/lib/request-insights-summary'
import { getRequestInsightsSnapshot } from '../../lib/trace/request-insights'
import { mcpTelemetryTracker } from '../mcp-telemetry-tracker'

const DEFAULT_REQUEST_LIMIT = 20
const RELATED_REQUEST_LIMIT = 100
const RELATED_REQUEST_BYTE_LIMIT = 1024 * 1024

export function registerGetRequestInsightsTool(server: McpServer) {
  server.registerTool(
    'get_request_insights',
    {
      description:
        'List recent Request Insights or inspect a retained request by ID. Useful for debugging slow renders, server fetches, cache behavior, and request timelines without an external OTEL collector.',
      inputSchema: {
        requestId: z.string().optional(),
        htmlRequestId: z.string().optional(),
      },
    },
    async (request) => {
      mcpTelemetryTracker.recordToolCall('mcp/get_request_insights')

      const snapshot = getRequestInsightsSnapshot()
      const memoryRequests = snapshot.requests.filter((insight) => {
        return (
          (request.requestId === undefined ||
            insight.requestId === request.requestId) &&
          (request.htmlRequestId === undefined ||
            insight.htmlRequestId === request.htmlRequestId)
        )
      })

      if (
        request.requestId === undefined &&
        request.htmlRequestId === undefined
      ) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  requests: snapshot.requests
                    .slice(-DEFAULT_REQUEST_LIMIT)
                    .map(summarizeRequestInsight),
                  source: 'memory',
                  hint: 'Pass requestId for a full trace or htmlRequestId for related requests.',
                },
                null,
                2
              ),
            },
          ],
        }
      }

      let truncated = memoryRequests.length > RELATED_REQUEST_LIMIT
      const requests = request.htmlRequestId
        ? memoryRequests.slice(-RELATED_REQUEST_LIMIT)
        : memoryRequests
      if (request.htmlRequestId) {
        while (
          requests.length > 1 &&
          Buffer.byteLength(JSON.stringify(requests), 'utf8') >
            RELATED_REQUEST_BYTE_LIMIT
        ) {
          requests.shift()
          truncated = true
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                requests,
                source: requests.length === 0 ? 'none' : 'memory',
                truncated,
              },
              null,
              2
            ),
          },
        ],
      }
    }
  )
}
