/**
 * Experimental MCP tools for bracketing a bounded multi-file agent edit as one Turbopack
 * invalidation transaction.
 *
 * begin_edit_transaction validates the complete changed-path set and does not return until the
 * filesystem watcher has acknowledged the boundary. Controllers must call end_edit_transaction in
 * a finally block and renew leases for edits longer than five seconds. The native watcher forces
 * progress when a lease is abandoned and caps the continuously held batch's lifetime.
 */
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { McpServer } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp'
import z from 'next/dist/compiled/zod'
import type { PageExtensions } from '../../../build/page-extensions-type'
import { createValidFileMatcher } from '../../lib/find-page-file'
import {
  getPossibleInstrumentationHookFilenames,
  getPossibleMiddlewareFilenames,
} from '../../../build/utils'
import type { Project } from '../../../build/swc/types'
import { mcpTelemetryTracker } from '../mcp-telemetry-tracker'

const EDIT_TRANSACTION_LEASE_MS = 5_000
const EDIT_TRANSACTION_LEASE_SAFETY_MS = 1_000
const EDIT_TRANSACTION_MAX_DURATION_MS = 60_000
const EXPIRED_TOKEN_RETENTION_MS = 60_000
const MAX_ACTIVE_EDIT_TRANSACTIONS = 32
const MAX_EXPIRED_EDIT_TRANSACTIONS = 64
const MAX_CHANGED_PATHS = 2_048
const MAX_RETAINED_CHANGED_PATH_CHARACTERS = 1_048_576

type EditTransaction = {
  project: Project
  nativeToken: number
  expiresAt: number
  maximumExpiresAt: number
  changedPaths: string[]
}

type ExpiredEditTransaction = {
  retainUntil: number
  transaction?: EditTransaction
}

function conservativeLease(
  acknowledgmentStartedAt: number,
  maximumExpiresAt: number
) {
  const expiresAt = Math.min(
    acknowledgmentStartedAt +
      EDIT_TRANSACTION_LEASE_MS -
      EDIT_TRANSACTION_LEASE_SAFETY_MS,
    maximumExpiresAt
  )
  return {
    expiresAt,
    leaseMs: Math.max(0, expiresAt - performance.now()),
  }
}

const errorResult = (error: unknown) => ({
  isError: true,
  content: [
    {
      type: 'text' as const,
      text: JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
    },
  ],
})

const successResult = (value: object) => ({
  content: [
    {
      type: 'text' as const,
      text: JSON.stringify(value),
    },
  ],
})

type RouteWatcherOptions = {
  appDir: string | undefined
  pagesDir: string | undefined
  pageExtensions: PageExtensions
}

function pathIsInside(directory: string, candidate: string) {
  const relative = path.relative(directory, candidate)
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  )
}

function createRouteWatcherPathMatcher(
  projectPath: string,
  { appDir, pagesDir, pageExtensions }: RouteWatcherOptions
) {
  const validFileMatcher = createValidFileMatcher(pageExtensions, appDir)
  const routeRoot =
    pagesDir || appDir ? path.dirname(pagesDir ?? appDir!) : projectPath
  const rootConventionFiles = new Set(
    [
      ...getPossibleMiddlewareFilenames(routeRoot, pageExtensions),
      ...getPossibleInstrumentationHookFilenames(routeRoot, pageExtensions),
    ].map((file) => path.resolve(file))
  )

  return (absolute: string) => {
    if (rootConventionFiles.has(absolute)) return true
    if (
      pagesDir &&
      pathIsInside(pagesDir, absolute) &&
      validFileMatcher.isPageFile(absolute)
    ) {
      return true
    }
    return Boolean(
      appDir &&
        pathIsInside(appDir, absolute) &&
        (validFileMatcher.isAppRouterPage(absolute) ||
          validFileMatcher.isAppLayoutPage(absolute) ||
          validFileMatcher.isAppDefaultPage(absolute) ||
          validFileMatcher.isRootNotFound(absolute))
    )
  }
}

function resolveChangedPaths(
  projectPath: string,
  turbopackRootPath: string,
  routeWatcherOptions: RouteWatcherOptions,
  changedPaths: string[]
) {
  const projectRoot = path.resolve(projectPath)
  const turbopackRoot = path.resolve(turbopackRootPath)
  const isRouteWatcherPath = createRouteWatcherPathMatcher(
    projectRoot,
    routeWatcherOptions
  )
  const resolved = new Set<string>()
  for (const changedPath of changedPaths) {
    if (path.isAbsolute(changedPath)) {
      throw new Error(`Changed path must be project-relative: ${changedPath}`)
    }
    const absolute = path.resolve(projectRoot, changedPath)
    const projectRelative = path.relative(projectRoot, absolute)
    if (
      projectRelative === '' ||
      projectRelative === '..' ||
      projectRelative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(projectRelative)
    ) {
      throw new Error(`Changed path leaves the project root: ${changedPath}`)
    }

    const normalizedProjectRelative = projectRelative.split(path.sep).join('/')
    if (
      /^\.env(?:\..+)?$/.test(normalizedProjectRelative) ||
      normalizedProjectRelative === 'tsconfig.json' ||
      normalizedProjectRelative === 'jsconfig.json' ||
      /^next\.config\.(?:js|mjs|cjs|ts|mts|cts)$/.test(
        normalizedProjectRelative
      ) ||
      isRouteWatcherPath(absolute)
    ) {
      throw new Error(
        `Changed path is watched outside the Turbopack source transaction: ${changedPath}`
      )
    }

    const turbopackRelative = path.relative(turbopackRoot, absolute)
    if (
      turbopackRelative === '' ||
      turbopackRelative === '..' ||
      turbopackRelative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(turbopackRelative)
    ) {
      throw new Error(
        `Changed path leaves the Turbopack filesystem root: ${changedPath}`
      )
    }
    resolved.add(turbopackRelative)
  }
  return [...resolved]
}

export function registerEditTransactionTools(
  server: McpServer,
  projectPath: string,
  turbopackRootPath: string,
  routeWatcherOptions: RouteWatcherOptions,
  getProject: () => Project | undefined
) {
  const activeTransactions = new Map<string, EditTransaction>()
  const expiredTransactions = new Map<string, ExpiredEditTransaction>()
  let batchMaximumExpiresAt: number | undefined
  // Count every declared path retained by the current native batch, including transactions that
  // ended while another token still held the batch. Reset only after the native flush is observed.
  let batchChangedPathCharacters = 0
  let controlQueue: Promise<void> = Promise.resolve()
  let cleanupTimer: ReturnType<typeof setTimeout> | undefined

  const serializeControl = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = controlQueue.then(operation, operation)
    controlQueue = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  const hasRetainedTransactionPayload = () =>
    [...expiredTransactions.values()].some(
      (expired) => expired.transaction !== undefined
    )

  const resetBatchAccounting = () => {
    batchMaximumExpiresAt = undefined
    batchChangedPathCharacters = 0
  }

  const resetBatchAccountingIfFlushed = (result: {
    accepted: boolean
    flushed: boolean
  }) => {
    if (
      activeTransactions.size === 0 &&
      !hasRetainedTransactionPayload() &&
      result.flushed
    ) {
      resetBatchAccounting()
    }
  }

  const resetBatchAccountingIfMaximumElapsed = (now: number) => {
    if (
      batchMaximumExpiresAt !== undefined &&
      batchMaximumExpiresAt <= now &&
      activeTransactions.size === 0 &&
      !hasRetainedTransactionPayload()
    ) {
      // Any native token that could not be explicitly settled is bounded by the same maximum. Once
      // its recovery payload has aged out, the native watcher has necessarily forced the batch out.
      resetBatchAccounting()
    }
  }

  function scheduleCleanup() {
    if (cleanupTimer !== undefined) clearTimeout(cleanupTimer)
    let nextDeadline = Number.POSITIVE_INFINITY
    for (const transaction of activeTransactions.values()) {
      nextDeadline = Math.min(nextDeadline, transaction.expiresAt)
    }
    for (const expired of expiredTransactions.values()) {
      nextDeadline = Math.min(nextDeadline, expired.retainUntil)
    }
    if (!Number.isFinite(nextDeadline)) {
      cleanupTimer = undefined
      return
    }
    cleanupTimer = setTimeout(
      () => {
        cleanupTimer = undefined
        void serializeControl(async () => {
          await pruneTransactions()
        })
      },
      Math.max(0, nextDeadline - performance.now())
    )
    cleanupTimer.unref()
  }

  function rememberExpired(
    token: string,
    now: number,
    transaction?: EditTransaction
  ) {
    // Refresh insertion order so the bounded map evicts the least recently touched token.
    expiredTransactions.delete(token)
    expiredTransactions.set(token, {
      retainUntil: now + EXPIRED_TOKEN_RETENTION_MS,
      transaction,
    })
    while (expiredTransactions.size > MAX_EXPIRED_EDIT_TRANSACTIONS) {
      const oldestToken = expiredTransactions.keys().next().value
      if (oldestToken === undefined) break
      expiredTransactions.delete(oldestToken)
    }
    scheduleCleanup()
  }

  async function settleExpiredTransaction(
    token: string,
    transaction: EditTransaction,
    now: number
  ) {
    try {
      const result = await transaction.project.endEditTransaction(
        transaction.nativeToken,
        transaction.changedPaths
      )
      // The authoritative paths have reached the native batch. Retain only the opaque public token
      // so a late end can report expiry without keeping Project or path payloads alive.
      rememberExpired(token, performance.now())
      resetBatchAccountingIfFlushed(result)
    } catch {
      // Preserve the payload for a late explicit end if native settlement itself failed.
      rememberExpired(token, now, transaction)
    }
  }

  async function pruneTransactions() {
    const now = performance.now()
    const expiredTransactionsToSettle: Array<[string, EditTransaction]> = []
    for (const [token, transaction] of activeTransactions) {
      if (transaction.expiresAt <= now) {
        activeTransactions.delete(token)
        expiredTransactionsToSettle.push([token, transaction])
      }
    }
    for (const [token, transaction] of expiredTransactionsToSettle) {
      await settleExpiredTransaction(token, transaction, now)
    }
    for (const [token, expired] of expiredTransactions) {
      if (expired.retainUntil <= now) expiredTransactions.delete(token)
    }
    resetBatchAccountingIfMaximumElapsed(now)
    scheduleCleanup()
  }

  server.registerTool(
    'begin_edit_transaction',
    {
      description:
        'Begin an acknowledged Turbopack source-edit transaction before changing multiple files. ' +
        'Declare every project-relative file and every directory that will be created, removed, or renamed. ' +
        'Environment/configuration files and routing convention files are rejected because independent dev-server watchers handle them. ' +
        'The dev server withholds filesystem invalidations until the matching end_edit_transaction call, ' +
        'so the browser receives one coherent final update instead of intermediate states. ' +
        'Always end the returned opaque token in a finally block and renew it before leaseMs elapses.',
      inputSchema: {
        changedPaths: z
          .array(z.string().min(1).max(4_096))
          .max(MAX_CHANGED_PATHS)
          .default([]),
      },
    },
    async ({ changedPaths }) => {
      mcpTelemetryTracker.recordToolCall('mcp/begin_edit_transaction')
      return serializeControl(async () => {
        try {
          await pruneTransactions()
          if (activeTransactions.size >= MAX_ACTIVE_EDIT_TRANSACTIONS) {
            throw new Error(
              `Too many active edit transactions (limit ${MAX_ACTIVE_EDIT_TRANSACTIONS})`
            )
          }
          const project = getProject()
          if (!project) {
            throw new Error(
              'Turbopack project is not available. This tool requires the Turbopack bundler.'
            )
          }
          const turbopackRelativeChangedPaths = resolveChangedPaths(
            projectPath,
            turbopackRootPath,
            routeWatcherOptions,
            changedPaths
          )
          const changedPathCharacters = turbopackRelativeChangedPaths.reduce(
            (length, changedPath) => length + changedPath.length,
            0
          )
          if (
            batchChangedPathCharacters + changedPathCharacters >
            MAX_RETAINED_CHANGED_PATH_CHARACTERS
          ) {
            throw new Error(
              `Too much retained changed-path data (limit ${MAX_RETAINED_CHANGED_PATH_CHARACTERS} characters)`
            )
          }
          const acknowledgmentStartedAt = performance.now()
          const maximumExpiresAt =
            batchMaximumExpiresAt ??
            acknowledgmentStartedAt + EDIT_TRANSACTION_MAX_DURATION_MS
          const nativeToken = await project.beginEditTransaction()
          const lease = conservativeLease(
            acknowledgmentStartedAt,
            maximumExpiresAt
          )
          if (lease.leaseMs === 0) {
            await project.endEditTransaction(nativeToken, [])
            throw new Error(
              'Edit transaction acknowledgement consumed its lease headroom; retry begin_edit_transaction'
            )
          }
          batchMaximumExpiresAt = maximumExpiresAt
          const token = randomUUID()
          activeTransactions.set(token, {
            project,
            nativeToken,
            expiresAt: lease.expiresAt,
            maximumExpiresAt,
            changedPaths: turbopackRelativeChangedPaths,
          })
          batchChangedPathCharacters += changedPathCharacters
          scheduleCleanup()
          return successResult({
            token,
            leaseMs: lease.leaseMs,
            maximumDurationMs: Math.max(
              0,
              maximumExpiresAt - performance.now()
            ),
          })
        } catch (error) {
          return errorResult(error)
        }
      })
    }
  )

  server.registerTool(
    'renew_edit_transaction',
    {
      description:
        'Renew one active Turbopack edit transaction lease while a bounded multi-file edit is still running. ' +
        'Renew before leaseMs elapses; renewal never extends another controller token or the continuously held batch maximum duration.',
      inputSchema: {
        token: z.string().uuid(),
      },
    },
    async ({ token }) => {
      mcpTelemetryTracker.recordToolCall('mcp/renew_edit_transaction')
      return serializeControl(async () => {
        try {
          await pruneTransactions()
          const transaction = activeTransactions.get(token)
          if (!transaction) {
            return successResult({
              token,
              status: expiredTransactions.has(token) ? 'expired' : 'unknown',
            })
          }
          const acknowledgmentStartedAt = performance.now()
          if (acknowledgmentStartedAt >= transaction.maximumExpiresAt) {
            activeTransactions.delete(token)
            await settleExpiredTransaction(
              token,
              transaction,
              acknowledgmentStartedAt
            )
            return successResult({ token, status: 'expired' })
          }
          const renewed = await transaction.project.renewEditTransaction(
            transaction.nativeToken
          )
          const lease = conservativeLease(
            acknowledgmentStartedAt,
            transaction.maximumExpiresAt
          )
          if (!renewed || lease.leaseMs === 0) {
            activeTransactions.delete(token)
            await settleExpiredTransaction(
              token,
              transaction,
              performance.now()
            )
            return successResult({ token, status: 'expired' })
          }
          transaction.expiresAt = lease.expiresAt
          scheduleCleanup()
          return successResult({
            token,
            status: 'renewed',
            leaseMs: lease.leaseMs,
          })
        } catch (error) {
          return errorResult(error)
        }
      })
    }
  )

  server.registerTool(
    'end_edit_transaction',
    {
      description:
        'End an acknowledged Turbopack source-edit transaction after every declared file write has completed. ' +
        "A flushed result means the final token's invalidations were submitted before this call returned.",
      inputSchema: {
        token: z.string().uuid(),
      },
    },
    async ({ token }) => {
      mcpTelemetryTracker.recordToolCall('mcp/end_edit_transaction')
      return serializeControl(async () => {
        try {
          await pruneTransactions()
          const activeTransaction = activeTransactions.get(token)
          const expired = expiredTransactions.get(token)
          const transaction = activeTransaction ?? expired?.transaction
          if (!transaction) {
            return successResult({
              token,
              status: expiredTransactions.has(token) ? 'expired' : 'unknown',
            })
          }
          const wasActive = activeTransaction !== undefined
          if (wasActive) {
            activeTransactions.delete(token)
          } else {
            expiredTransactions.set(token, {
              retainUntil: expired!.retainUntil,
            })
          }
          let result
          try {
            result = await transaction.project.endEditTransaction(
              transaction.nativeToken,
              transaction.changedPaths
            )
          } catch (error) {
            const now = performance.now()
            if (wasActive) {
              if (now < transaction.expiresAt) {
                activeTransactions.set(token, transaction)
              } else {
                rememberExpired(token, now, transaction)
              }
            } else if (now < expired!.retainUntil) {
              expiredTransactions.set(token, {
                retainUntil: expired!.retainUntil,
                transaction,
              })
            }
            scheduleCleanup()
            throw error
          }
          if (result.accepted) {
            expiredTransactions.delete(token)
          } else {
            rememberExpired(token, performance.now())
          }
          resetBatchAccountingIfFlushed(result)
          scheduleCleanup()
          return successResult({
            token,
            status: !result.accepted
              ? 'expired_or_rescanned'
              : result.flushed
                ? 'flushed'
                : 'held_by_other_transaction',
          })
        } catch (error) {
          return errorResult(error)
        }
      })
    }
  )
}
