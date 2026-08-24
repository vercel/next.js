/**
 * MCP tools for agent-scoped HMR batching.
 *
 * These are the only way to open and close a batch, and they are registered
 * only when `experimental.agentHmrBatching` is set. See
 * `../../dev/agent-hmr-batch.ts` for what a batch actually does.
 *
 * The intended shape of an agent's turn is:
 *
 *   begin_hmr_batch  →  write files  →  end_hmr_batch
 *
 * with `end_hmr_batch` being the thing that reports whether the edit compiles.
 * That is the point of the batch: the errors go to the agent that can still
 * fix them, while the human watching the preview never sees the intermediate
 * states.
 */
import type { McpServer } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp'
import z from 'next/dist/compiled/zod'
import { mcpTelemetryTracker } from '../mcp-telemetry-tracker'
import {
  type AgentHmrBatchController,
  DEFAULT_BATCH_TIMEOUT_MS,
  MAX_BATCH_TIMEOUT_MS,
  MIN_BATCH_TIMEOUT_MS,
} from '../../dev/agent-hmr-batch'

function json(value: unknown, isError?: boolean) {
  return {
    ...(isError ? { isError: true } : null),
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
  }
}

export function registerHmrBatchTools(
  server: McpServer,
  getController: () => AgentHmrBatchController
) {
  server.registerTool(
    'begin_hmr_batch',
    {
      description:
        'Open an HMR batch before making a multi-step edit. While the batch is open the dev server ' +
        'holds back every HMR update, so the browser preview keeps rendering the last output that ' +
        'compiled instead of flickering through each intermediate step. Always close it with ' +
        'end_hmr_batch, which reports whether the finished edit compiles. ' +
        'Batches do not nest: if one is already open this returns that batch instead of opening another.',
      inputSchema: {
        timeoutMs: z
          .number()
          .int()
          .describe(
            'How long the batch may stay open before the dev server closes it on its own, in ' +
              `milliseconds (default ${DEFAULT_BATCH_TIMEOUT_MS}, clamped to ` +
              `${MIN_BATCH_TIMEOUT_MS}–${MAX_BATCH_TIMEOUT_MS}). This is a safety net for an agent ` +
              'that exits without closing its batch; it is not a deadline to plan edits around.'
          )
          .optional(),
      },
    },
    async ({ timeoutMs }) => {
      mcpTelemetryTracker.recordToolCall('mcp/begin_hmr_batch')

      const result = getController().begin({ timeoutMs })

      if (result.status === 'disabled') {
        return json(
          {
            error:
              'Agent HMR batching is not enabled. Set `experimental.agentHmrBatching: true` in next.config.js.',
          },
          true
        )
      }

      return json(result)
    }
  )

  server.registerTool(
    'end_hmr_batch',
    {
      description:
        'Close the HMR batch opened by begin_hmr_batch. Waits for the compilation triggered by the ' +
        'edit to settle, then either delivers the held updates to the browser as a single update ' +
        '(status "flushed") or, when the edit does not compile, leaves the preview on the last good ' +
        'state and returns the errors (status "withheld"). A "withheld" result means the errors are ' +
        'yours to fix: the held updates are still queued and are delivered once the code compiles ' +
        'again. `compiled: false` means no compilation was observed at all, so an empty error list ' +
        'says nothing about whether the code is valid.',
      inputSchema: {},
    },
    async () => {
      mcpTelemetryTracker.recordToolCall('mcp/end_hmr_batch')

      const result = await getController().end()

      if (result.status === 'disabled') {
        return json(
          {
            error:
              'Agent HMR batching is not enabled. Set `experimental.agentHmrBatching: true` in next.config.js.',
          },
          true
        )
      }

      return json(result)
    }
  )

  server.registerTool(
    'get_hmr_batch_status',
    {
      description:
        'Report whether an HMR batch is open, how many HMR messages it is holding back, and the ' +
        'errors from the most recent compilation. Useful for recovering after losing track of ' +
        'batch state, and for checking whether updates are still queued behind a failed batch.',
      inputSchema: {},
    },
    async () => {
      mcpTelemetryTracker.recordToolCall('mcp/get_hmr_batch_status')
      return json(getController().status())
    }
  )
}
