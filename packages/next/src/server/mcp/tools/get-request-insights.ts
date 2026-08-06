import type { McpServer } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp'
import z from 'next/dist/compiled/zod'
import type { RequestInsights } from '../../lib/trace/request-insights'
import type {
  RequestInsight,
  RequestInsightsSnapshot,
} from '../../../next-devtools/shared/request-insights'
import {
  createBoundedRequestInsightsSnapshotProjection,
  getRequestInsightRootId,
  REQUEST_INSIGHTS_ID_PATTERN,
  REQUEST_INSIGHTS_MAX_GROUPS_PER_RETENTION_BUCKET,
  REQUEST_INSIGHTS_MAX_ID_LENGTH,
  REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES,
} from '../../../next-devtools/shared/request-insights'
import {
  getTerminalSafeJsonByteLength,
  getUtf8ByteLength,
  stringifyTerminalSafeJson,
} from '../../../next-devtools/shared/terminal-safe-json'
import { mcpTelemetryTracker } from '../mcp-telemetry-tracker'

export const getRequestInsightsInputSchema = {
  requestId: z
    .string()
    .min(1)
    .max(REQUEST_INSIGHTS_MAX_ID_LENGTH)
    .regex(REQUEST_INSIGHTS_ID_PATTERN)
    .optional(),
  htmlRequestId: z
    .string()
    .min(1)
    .max(REQUEST_INSIGHTS_MAX_ID_LENGTH)
    .regex(REQUEST_INSIGHTS_ID_PATTERN)
    .optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(REQUEST_INSIGHTS_MAX_GROUPS_PER_RETENTION_BUCKET)
    .optional(),
}

export function registerGetRequestInsightsTool(
  server: McpServer,
  getRequestInsights: () => RequestInsights | undefined
) {
  server.registerTool(
    'get_request_insights',
    {
      description:
        'Get recent App Router request insights captured by the local Next.js span recorder. Useful for debugging slow renders, server fetches, cache behavior, and request timelines without an external OTEL collector. Requires experimental.requestInsights.',
      inputSchema: getRequestInsightsInputSchema,
    },
    async (request) => {
      mcpTelemetryTracker.recordToolCall('mcp/get_request_insights')

      const requestInsights = getRequestInsights()
      if (!requestInsights) {
        return {
          content: [
            {
              type: 'text',
              text: stringifyTerminalSafeJson({
                error:
                  'Request Insights is not enabled. Set experimental.requestInsights = true in next.config.js and restart next dev.',
              }),
            },
          ],
        }
      }

      const snapshot = requestInsights.getSnapshot(request)

      return {
        content: [
          {
            type: 'text',
            text: serializeRequestInsightsSnapshotForMcp(snapshot),
          },
        ],
      }
    }
  )
}

export function serializeRequestInsightsSnapshotForMcp(
  snapshot: RequestInsightsSnapshot
): string {
  const groupsByRootId = new Map<string, RequestInsight[]>()
  for (const request of snapshot.requests) {
    const rootRequestId = getRequestInsightRootId(request)
    const group = groupsByRootId.get(rootRequestId)
    if (group) {
      group.push(request)
    } else {
      groupsByRootId.set(rootRequestId, [request])
    }
  }

  const groups = Array.from(groupsByRootId.values())
  const groupByteLengths = groups.map(getTerminalSafeJsonByteLength)
  const { snapshot: boundedSnapshot } =
    createBoundedRequestInsightsSnapshotProjection(
      groups,
      REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES,
      snapshot.capture,
      Number.POSITIVE_INFINITY,
      groupByteLengths,
      snapshot.projection
    )
  const serialized = stringifyTerminalSafeJson(boundedSnapshot)
  if (getUtf8ByteLength(serialized) > REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES) {
    throw new Error('Request Insights MCP output exceeded its byte limit.')
  }
  return serialized
}
