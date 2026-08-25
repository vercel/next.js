import type { McpServer } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp'
import z from 'next/dist/compiled/zod'
import type { RequestInsight } from '../../../next-devtools/shared/request-insights'
import { summarizeRequestInsight } from '../../../next-devtools/shared/request-insights-summary'
import {
  getRequestInsightsSnapshot,
  isRequestInsightsEnabled,
  readRequestInsightsHistory,
} from '../../lib/trace/request-insights'
import { mcpTelemetryTracker } from '../mcp-telemetry-tracker'

const DEFAULT_REQUEST_LIMIT = 20
const RELATED_REQUEST_LIMIT = 100
const RELATED_REQUEST_BYTE_LIMIT = 1024 * 1024

export function registerGetRequestInsightsTool(server: McpServer) {
  server.registerTool(
    'get_request_insights',
    {
      description:
        'List recent Request Insights or inspect a request by ID, including completed requests that have left the in-memory window. Useful for debugging slow renders, server fetches, cache behavior, and request timelines without an external OTEL collector. Requires experimental.requestInsights.',
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

      const journalRequests = await readRequestInsightsHistory({
        requestId: request.requestId,
        htmlRequestId: request.htmlRequestId,
        limit:
          request.htmlRequestId !== undefined
            ? RELATED_REQUEST_LIMIT + 1
            : undefined,
      })
      const requestsByKey = new Map(
        journalRequests.map((insight) => [getRequestKey(insight), insight])
      )
      for (const insight of memoryRequests) {
        requestsByKey.set(getRequestKey(insight), insight)
      }
      const allRequests = Array.from(requestsByKey.values())
      let truncated = allRequests.length > RELATED_REQUEST_LIMIT
      const requests = request.htmlRequestId
        ? allRequests.slice(-RELATED_REQUEST_LIMIT)
        : allRequests
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
                source:
                  requests.length === 0
                    ? 'none'
                    : memoryRequests.length > 0 && journalRequests.length > 0
                      ? 'memory-and-journal'
                      : memoryRequests.length > 0
                        ? 'memory'
                        : 'journal',
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

function getRequestKey(request: Pick<RequestInsight, 'requestId' | 'kind'>) {
  return `${request.kind ?? 'request'}:${request.requestId}`
}
