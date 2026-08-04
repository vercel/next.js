/** Experimental MCP tools for publishing a multi-file agent edit as one Turbopack update. */
import { randomUUID } from 'node:crypto'
import type { McpServer } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp'
import z from 'next/dist/compiled/zod'
import type { Project } from '../../../build/swc/types'
import { mcpTelemetryTracker } from '../mcp-telemetry-tracker'
import {
  MAX_CHANGED_PATHS,
  resolveEditTransactionPaths,
  type RouteWatcherOptions,
} from './edit-transaction-paths'

const NATIVE_LEASE_MS = 5_000
const CONTROLLER_LEASE_MS = 4_000
const MAXIMUM_DURATION_MS = 60_000
const MAX_ACTIVE_TRANSACTIONS = 32

type EditTransaction = {
  project: Project
  nativeToken: number
  maximumExpiration: number
  nativeExpiration: number
  operation: Promise<void>
  pendingOperations: number
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

const errorResult = (error: unknown) => ({
  isError: true,
  content: [
    {
      type: 'text' as const,
      text: JSON.stringify({
        error: errorMessage(error),
      }),
    },
  ],
})

const successResult = (value: object) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value) }],
})

export function registerEditTransactionTools(
  server: McpServer,
  projectPath: string,
  turbopackRootPath: string,
  routeWatcherOptions: RouteWatcherOptions,
  getProject: () => Project | undefined
) {
  const activeTransactions = new Map<string, EditTransaction>()

  function pruneExpiredTransactions(now = performance.now()) {
    for (const [token, transaction] of activeTransactions) {
      if (
        transaction.pendingOperations === 0 &&
        transaction.nativeExpiration <= now
      ) {
        activeTransactions.delete(token)
      }
    }
  }

  function getTransaction(token: string) {
    const transaction = activeTransactions.get(token)
    if (
      transaction &&
      transaction.pendingOperations === 0 &&
      transaction.nativeExpiration <= performance.now()
    ) {
      activeTransactions.delete(token)
      return undefined
    }
    return transaction
  }

  async function serializeTransaction<T>(
    transaction: EditTransaction,
    operation: () => Promise<T>
  ): Promise<T> {
    transaction.pendingOperations++
    const previousOperation = transaction.operation
    let release!: () => void
    transaction.operation = new Promise<void>((resolve) => {
      release = resolve
    })
    await previousOperation
    try {
      return await operation()
    } finally {
      transaction.pendingOperations--
      release()
    }
  }

  server.registerTool(
    'begin_edit_transaction',
    {
      description:
        'Begin one acknowledged Turbopack update before changing multiple files. ' +
        'Declare every project-relative file path up front; directory declarations are rejected. Routing and configuration files are rejected ' +
        'because independent dev-server watchers handle them. Adding the first TypeScript file to an app is also rejected until TypeScript setup completes. ' +
        'Always end the returned token in a finally block.',
      inputSchema: {
        changedPaths: z
          .array(z.string().min(1).max(4_096))
          .min(1)
          .max(MAX_CHANGED_PATHS),
      },
    },
    async ({ changedPaths }) => {
      mcpTelemetryTracker.recordToolCall('mcp/begin_edit_transaction')
      try {
        pruneExpiredTransactions()
        if (activeTransactions.size >= MAX_ACTIVE_TRANSACTIONS) {
          throw new Error(
            `Too many active edit transactions (limit ${MAX_ACTIVE_TRANSACTIONS})`
          )
        }
        const project = getProject()
        if (!project) {
          throw new Error(
            'Turbopack project is not available. This tool requires the Turbopack bundler.'
          )
        }
        const resolvedPaths = resolveEditTransactionPaths(
          projectPath,
          turbopackRootPath,
          routeWatcherOptions,
          changedPaths
        )
        const startedAt = performance.now()
        const nativeToken = await project.beginEditTransaction(resolvedPaths)
        if (nativeToken === null) {
          return successResult({ status: 'busy', retryAfterMs: 25 })
        }
        const acknowledgedAt = performance.now()
        const maximumExpiration = startedAt + MAXIMUM_DURATION_MS
        const leaseMs = Math.max(
          0,
          Math.min(startedAt + CONTROLLER_LEASE_MS, maximumExpiration) -
            acknowledgedAt
        )
        if (leaseMs === 0) {
          try {
            await project.endEditTransaction(nativeToken)
          } catch {
            // The native lease remains the crash-safety fallback. Preserve the
            // actionable controller timeout instead of masking it with cleanup.
          }
          throw new Error('Edit transaction acknowledgement timed out; retry')
        }
        const token = randomUUID()
        activeTransactions.set(token, {
          project,
          nativeToken,
          maximumExpiration,
          nativeExpiration: Math.min(
            startedAt + NATIVE_LEASE_MS,
            maximumExpiration
          ),
          operation: Promise.resolve(),
          pendingOperations: 0,
        })
        return successResult({
          token,
          status: 'started',
          leaseMs,
          maximumDurationMs: MAXIMUM_DURATION_MS,
        })
      } catch (error) {
        return errorResult(error)
      }
    }
  )

  server.registerTool(
    'renew_edit_transaction',
    {
      description:
        'Renew the bounded lease for one active Turbopack edit transaction before leaseMs elapses.',
      inputSchema: { token: z.string().uuid() },
    },
    async ({ token }) => {
      mcpTelemetryTracker.recordToolCall('mcp/renew_edit_transaction')
      try {
        const transaction = getTransaction(token)
        if (!transaction) return successResult({ token, status: 'unknown' })
        return await serializeTransaction(transaction, async () => {
          if (activeTransactions.get(token) !== transaction) {
            return successResult({ token, status: 'unknown' })
          }
          const startedAt = performance.now()
          const renewed = await transaction.project.renewEditTransaction(
            transaction.nativeToken
          )
          if (!renewed) {
            activeTransactions.delete(token)
            return successResult({ token, status: 'expired' })
          }

          transaction.nativeExpiration = Math.min(
            startedAt + NATIVE_LEASE_MS,
            transaction.maximumExpiration
          )
          const leaseMs = Math.max(
            0,
            Math.min(
              startedAt + CONTROLLER_LEASE_MS,
              transaction.maximumExpiration
            ) - performance.now()
          )
          if (leaseMs === 0) {
            activeTransactions.delete(token)
            try {
              await transaction.project.endEditTransaction(
                transaction.nativeToken
              )
            } catch {
              // Native expiration at the absolute deadline remains authoritative.
            }
            return successResult({ token, status: 'expired' })
          }
          return successResult({
            token,
            status: 'renewed',
            leaseMs,
          })
        })
      } catch (error) {
        return errorResult(error)
      }
    }
  )

  server.registerTool(
    'end_edit_transaction',
    {
      description:
        'End one acknowledged Turbopack edit transaction after all declared writes complete. ' +
        'A flushed result means invalidations were submitted before this call returned.',
      inputSchema: { token: z.string().uuid() },
    },
    async ({ token }) => {
      mcpTelemetryTracker.recordToolCall('mcp/end_edit_transaction')
      const transaction = getTransaction(token)
      if (!transaction) return successResult({ token, status: 'unknown' })
      try {
        return await serializeTransaction(transaction, async () => {
          if (activeTransactions.get(token) !== transaction) {
            return successResult({ token, status: 'unknown' })
          }
          activeTransactions.delete(token)
          let flushed: boolean
          try {
            flushed = await transaction.project.endEditTransaction(
              transaction.nativeToken
            )
          } catch (error) {
            activeTransactions.set(token, transaction)
            throw error
          }
          return successResult({
            token,
            status: flushed ? 'flushed' : 'expired',
          })
        })
      } catch (error) {
        return errorResult(error)
      }
    }
  )
}
