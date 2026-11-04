import type { ReporterRunSpecification } from './custom-reporter-specifications'
import type { TestRecordEvent } from '../contracts'
import type { TestArtifact } from '../runner/tasks'
import type { ReporterTestRecordOutcome } from './test-records'
import type { SnapshotPreparationFailure } from '../execution/snapshot-preparation'
import { resolve as resolvePath, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { realpath } from 'node:fs/promises'
import { format } from 'node:util'
import type { TestEntry } from '../contracts'
import {
  runTestProcess,
  type TestProcessOptions,
  type TestProcessExit,
} from '../execution/process'
import type { ResultEvent, SerializedDiagnostic } from './events'
import type { CustomReporterCompletion } from './custom-reporter-tasks'
import type { ReporterTaskSnapshot } from './live-tasks'
import type { ReporterCaseEvent } from './task-updates'

export interface CustomReporterInvocation {
  count: number
  synchronousThrow?: { reporterIndex: number }
}

export interface CustomReporterInitialCloseFailure {
  kind: 'sync' | 'async'
  error: Error
}

export interface CustomReporterCompletionFailure {
  reporterIndex: number
  kind: 'access' | 'noncallable'
}
export type CustomReporterCompletionPrefix =
  | CustomReporterInvocation
  | {
      completionFailure: CustomReporterCompletionFailure
      invocation?: { count: number }
    }

const builtinReporters = new Set([
  'default',
  'agent',
  'minimal',
  'blob',
  'verbose',
  'dot',
  'json',
  'tap',
  'tap-flat',
  'junit',
  'tree',
  'hanging-process',
  'github-actions',
  'html',
])

function isPackageReporter(name: string): boolean {
  return (
    !builtinReporters.has(name) &&
    /^(?:@[A-Za-z0-9_~-][A-Za-z0-9._~-]*\/)?[A-Za-z0-9_~-][A-Za-z0-9._~-]*(?:\/[A-Za-z0-9._~-]+)*$/.test(
      name
    ) &&
    !name.split('/').some((part) => part === '.' || part === '..')
  )
}

/** Custom reporters use their own supervised evaluated realm. */
export function isCustomResultReporter(name: string): boolean {
  return (
    name.startsWith('.') ||
    name.startsWith('/') ||
    /^[A-Za-z]:[/\\]/.test(name) ||
    name.startsWith('file:') ||
    isPackageReporter(name)
  )
}
function reporterPath(name: string, projectDir: string) {
  if (isPackageReporter(name)) return name
  const file = name.startsWith('file:')
    ? fileURLToPath(name)
    : resolvePath(projectDir, name)
  if (
    !['.js', '.mjs', '.cjs', '.ts', '.mts', '.jsx', '.tsx'].includes(
      extname(file)
    )
  )
    throw new Error(
      'Custom reporter completion adapters require a JavaScript .js, .mjs or .cjs module, an ES module .ts or .mts entry, or a .jsx or .tsx module; other TypeScript file profiles remain unimplemented.'
    )
  return file
}
function remoteError(
  value: SerializedDiagnostic,
  preserveMissingStack = false
): Error {
  const error = value.errors
    ? new AggregateError(
        value.errors.map((diagnostic) =>
          remoteError(diagnostic, preserveMissingStack)
        ),
        value.message
      )
    : new Error(
        value.message,
        value.cause
          ? { cause: remoteError(value.cause, preserveMissingStack) }
          : undefined
      )
  error.name = value.name ?? 'Error'
  if (value.stack || preserveMissingStack) error.stack = value.stack
  return error
}

export type CustomReporterTransport = (
  options: TestProcessOptions
) => Promise<TestProcessExit>

export async function openCustomReporters(options: {
  projectDir: string
  reporters: readonly string[]
  transport?: CustomReporterTransport
  /** Actual final physical owner installed by the one-shot controller. */
  finalExitLifecycle?: { teardownTimeout: number }
  /** Retain reporter instances while closed watch generations replace task state. */
  watch?: boolean
  signal?: AbortSignal
  write(text: string): void
  writeError?(text: string): void
}) {
  const completionExitCode = (completion: CustomReporterCompletion) =>
    options.finalExitLifecycle &&
    (completion.status === 'failed' || completion.status === 'cancelled')
      ? {
          exitCodeSnapshot: {
            value: completion.status === 'cancelled' ? 130 : 1,
          },
        }
      : {}
  const projectRoot = await realpath(options.projectDir)
  const files = options.reporters.map((name) =>
    reporterPath(name, options.projectDir)
  )
  const controller = new AbortController()
  const abort = () => controller.abort(options.signal?.reason)
  if (options.signal?.aborted) abort()
  else options.signal?.addEventListener('abort', abort, { once: true })
  let send!: (message: object) => Promise<void>
  let pending:
    | {
        resolve(): void
        reject(error: unknown): void
        requestType?: string
        invoked?(receipt: CustomReporterInvocation): void
        prefix?(receipt: CustomReporterCompletionPrefix): void
        prefixReceived?: boolean
        completionFailureReceived?: boolean
        timer?: ReturnType<typeof setTimeout>
      }
    | undefined
  let terminalWatchFailure = false
  let watchHookError: Error | undefined
  let captureRunStart = false
  let captureTaskResults = false
  let captureModuleQueued = false
  let captureModuleCollected = false
  let captureModuleStart = false
  let captureCaseReady = false
  let captureTestRecords = false
  let nextRecordId = 0
  const recordRequests = new Map<
    number,
    {
      event: TestRecordEvent
      resolve(value: TestArtifact | undefined): void
      reject(error: unknown): void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  const recordWrites = new Set<Promise<TestArtifact | undefined>>()
  function rejectRecordRequests(error: unknown) {
    for (const recordRequest of recordRequests.values()) {
      clearTimeout(recordRequest.timer)
      recordRequest.reject(error)
    }
    recordRequests.clear()
  }
  controller.signal.addEventListener(
    'abort',
    () => rejectRecordRequests(controller.signal.reason),
    { once: true }
  )
  if (controller.signal.aborted) rejectRecordRequests(controller.signal.reason)
  let reporterErrors: SerializedDiagnostic[] = []
  let cancelledReporterErrors: Error[] | undefined
  let terminalReporterFailure:
    | { error: Error; reporterErrors: SerializedDiagnostic[] }
    | undefined
  const cancellationFailures = new Set<unknown>()
  const deliveredCancellationFailures = new Set<unknown>()
  const retainCancellationFailure = (error: unknown) => {
    if (options.signal?.aborted && error !== options.signal.reason)
      cancellationFailures.add(error)
  }
  let closing = false
  let closed = false
  let failure: unknown
  let deliveredFailure: unknown
  let publicationExitFailure: unknown
  let publicationExitCause: unknown
  let shutdownResponseFailure: unknown
  let initialCloseFailure: CustomReporterInitialCloseFailure | undefined
  let disposal: Promise<void> | undefined
  let consoleQueue = Promise.resolve()
  const queuedWrites: Promise<void>[] = []
  const collectedWrites: Promise<void>[] = []
  const preparationWrites: Promise<void>[] = []
  const preparedEntries = new Set<string>()
  let consoleFailure: unknown
  const observedModules = new Set<string>()
  const retainConsoleFailure = (error: unknown) => {
    consoleFailure ??= error
    retainCancellationFailure(error)
  }
  async function settleCancellation(onlyUndelivered = false) {
    await exit
    // This paired finish Error already owns its exact cumulative callback list.
    // A later replacement list remains independent of that reply.
    const callbackErrors =
      terminalReporterFailure?.reporterErrors === reporterErrors
        ? []
        : (cancelledReporterErrors ??= reporterErrors.map((diagnostic) =>
            remoteError(diagnostic)
          ))
    const errors = [
      ...new Set([
        ...callbackErrors,
        consoleFailure,
        failure,
        ...cancellationFailures,
        terminalReporterFailure?.error,
        initialCloseFailure?.error,
      ]),
    ].filter(
      (error) =>
        error !== undefined &&
        error !== options.signal?.reason &&
        (!onlyUndelivered ||
          (!deliveredCancellationFailures.has(error) &&
            error !== deliveredFailure))
    )
    for (const error of errors) deliveredCancellationFailures.add(error)
    if (errors.length === 1) throw errors[0]
    if (errors.length)
      throw new AggregateError(errors, 'Custom reporter cancellation failed.')
  }
  function response(
    requestType?: string,
    invoked?: (receipt: CustomReporterInvocation) => void,
    prefix?: (receipt: CustomReporterCompletionPrefix) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      pending = {
        resolve,
        reject,
        requestType,
        invoked,
        prefix,
        timer: setTimeout(() => {
          const error = new Error('Custom reporter request timed out.')
          failure ??= error
          reject(error)
          controller.abort(error)
        }, 120000),
      }
    })
  }
  const loaded = response()
  const transport: CustomReporterTransport =
    options.transport ??
    ((processOptions) =>
      runTestProcess(
        require.resolve('./custom-reporter-worker'),
        processOptions
      ))
  const exit = transport({
    cwd: options.projectDir,
    env: process.env,
    input: {
      files,
      projectDir: options.projectDir,
      queuedProjectRoot: projectRoot,
      ...(options.finalExitLifecycle
        ? {
            finalExitLifecycle: true,
            teardownTimeout: options.finalExitLifecycle.teardownTimeout,
          }
        : {}),
      ...(options.watch ? { watch: true } : {}),
    },
    signal: controller.signal,
    shutdownGraceMs: 10000,
    onReady(value) {
      send = value
    },
    onMessage(message: any) {
      if (message?.type === 'custom-reporter-record-result') {
        const record = recordRequests.get(message.recordId)
        if (!record && (controller.signal.aborted || closed)) return
        const outcome = message.outcome as ReporterTestRecordOutcome
        if (
          !record ||
          message.runId !== record.event.runId ||
          message.entryId !== record.event.entryId ||
          message.revision !== record.event.revision ||
          !outcome ||
          !['return', 'throw'].includes(outcome.kind) ||
          (outcome.kind === 'return'
            ? !Object.hasOwn(outcome, 'value')
            : !Object.hasOwn(outcome, 'error'))
        )
          throw new Error('Invalid custom reporter record response.')
        recordRequests.delete(message.recordId)
        clearTimeout(record.timer)
        if (outcome.kind === 'throw') record.reject(outcome.error)
        else record.resolve(outcome.value)
        return
      }
      if (message?.type === 'custom-reporter-completion-failure') {
        const record = message.completionFailure
        const invocation = message.invocation
        if (
          pending?.requestType !== 'finish-begin' ||
          !pending.prefix ||
          pending.prefixReceived ||
          Object.keys(message).some(
            (key) => !['type', 'completionFailure', 'invocation'].includes(key)
          ) ||
          !record ||
          typeof record !== 'object' ||
          Array.isArray(record) ||
          Object.keys(record).length !== 2 ||
          !Object.hasOwn(record, 'reporterIndex') ||
          !Object.hasOwn(record, 'kind') ||
          !Number.isSafeInteger(record.reporterIndex) ||
          record.reporterIndex < 0 ||
          record.reporterIndex >= files.length ||
          !['access', 'noncallable'].includes(record.kind) ||
          (Object.hasOwn(message, 'invocation') &&
            (!invocation ||
              typeof invocation !== 'object' ||
              Array.isArray(invocation) ||
              Object.keys(invocation).length !== 1 ||
              !Object.hasOwn(invocation, 'count') ||
              !Number.isSafeInteger(invocation.count) ||
              invocation.count < 1 ||
              invocation.count > record.reporterIndex))
        )
          throw new Error('Invalid custom reporter completion-failure receipt.')
        pending.prefixReceived = true
        pending.completionFailureReceived = true
        if (invocation) pending.invoked?.({ count: invocation.count })
        pending.prefix({
          completionFailure: {
            reporterIndex: record.reporterIndex,
            kind: record.kind,
          },
          ...(invocation ? { invocation: { count: invocation.count } } : {}),
        })
        return
      }
      if (message?.type === 'custom-reporter-invoked') {
        if (
          pending?.requestType !== 'finish-begin' ||
          !pending.invoked ||
          pending.prefixReceived ||
          !Number.isSafeInteger(message.count) ||
          message.count < 1 ||
          message.count > files.length ||
          (message.synchronousThrow !== undefined &&
            (!message.synchronousThrow ||
              typeof message.synchronousThrow !== 'object' ||
              Object.keys(message.synchronousThrow).length !== 1 ||
              !Object.hasOwn(message.synchronousThrow, 'reporterIndex') ||
              !Number.isSafeInteger(message.synchronousThrow.reporterIndex) ||
              message.synchronousThrow.reporterIndex < 0 ||
              message.synchronousThrow.reporterIndex >= files.length))
        )
          throw new Error('Invalid custom reporter invocation receipt.')
        const receipt = {
          count: message.count,
          ...(message.synchronousThrow === undefined
            ? {}
            : { synchronousThrow: message.synchronousThrow }),
        }
        pending.prefixReceived = true
        pending.invoked(receipt)
        pending.prefix?.(receipt)
        return
      }
      if (
        message?.type !== 'custom-reporter-result' &&
        message?.type !== 'custom-reporter-failed'
      )
        throw new Error('Invalid custom reporter response.')
      if (
        message.type === 'custom-reporter-result' &&
        pending?.completionFailureReceived
      )
        throw new Error(
          'Completion failure received a successful final response.'
        )
      const synchronousCloseFailure = Object.hasOwn(
        message,
        'initialCloseSyncFailed'
      )
      const asynchronousCloseFailure = Object.hasOwn(
        message,
        'initialCloseAsyncFailed'
      )
      if (
        (synchronousCloseFailure || asynchronousCloseFailure) &&
        (!options.finalExitLifecycle ||
          options.watch ||
          pending?.requestType !== 'shutdown' ||
          message.type !== 'custom-reporter-failed' ||
          initialCloseFailure !== undefined ||
          (synchronousCloseFailure && asynchronousCloseFailure) ||
          (synchronousCloseFailure &&
            message.initialCloseSyncFailed !== true) ||
          (asynchronousCloseFailure &&
            message.initialCloseAsyncFailed !== true))
      )
        throw new Error('Invalid custom reporter initial close failure.')
      if (message.captureTestRecords !== undefined)
        captureTestRecords = message.captureTestRecords === true
      if (message.captureRunStart !== undefined)
        captureRunStart = message.captureRunStart === true
      if (message.captureModuleStart !== undefined)
        captureModuleStart = message.captureModuleStart === true
      if (message.captureCaseReady !== undefined)
        captureCaseReady = message.captureCaseReady === true
      if (message.captureModuleCollected !== undefined)
        captureModuleCollected = message.captureModuleCollected === true
      if (message.captureModuleQueued !== undefined)
        captureModuleQueued = message.captureModuleQueued === true
      if (message.captureTaskResults !== undefined)
        captureTaskResults = message.captureTaskResults === true
      if (message.reporterErrors !== undefined) {
        if (!Array.isArray(message.reporterErrors))
          throw new Error('Invalid custom reporter error list.')
        reporterErrors = message.reporterErrors
        cancelledReporterErrors = undefined
      }
      if (message.watchHookError !== undefined) {
        if (!options.watch || pending?.requestType !== 'watch-ready')
          throw new Error('Unexpected custom reporter watch error.')
        watchHookError = remoteError(message.watchHookError)
      }
      if (message.fatalWatchError === true) {
        if (
          !options.watch ||
          !['watch-begin', 'watch-ready', 'watch-removed'].includes(
            pending?.requestType ?? ''
          )
        )
          throw new Error('Unexpected terminal custom watch response.')
        terminalWatchFailure = true
      }
      const error =
        message.type === 'custom-reporter-failed'
          ? remoteError(
              message.error,
              synchronousCloseFailure || asynchronousCloseFailure
            )
          : undefined
      if (error && (synchronousCloseFailure || asynchronousCloseFailure)) {
        initialCloseFailure = {
          kind: synchronousCloseFailure ? 'sync' : 'async',
          error,
        }
        if (asynchronousCloseFailure) {
          const logged = Object.getOwnPropertyDescriptor(
            message,
            'initialCloseErrorLogged'
          )
          if (
            logged !== undefined &&
            (!Object.hasOwn(logged, 'value') || logged.value !== true)
          )
            throw new Error(
              'Invalid custom reporter initial close log receipt.'
            )
          if (logged === undefined)
            (options.writeError ?? options.write)(
              format('error during close', error) + '\n'
            )
        }
      }
      if (error) {
        if (!asynchronousCloseFailure) failure ??= error
        retainCancellationFailure(error)
      }
      const current = pending
      if (error && current?.requestType === 'shutdown')
        shutdownResponseFailure = error
      if (
        error &&
        ['finish', 'finish-begin'].includes(current?.requestType ?? '') &&
        message.reporterErrors !== undefined
      )
        terminalReporterFailure = { error, reporterErrors }
      pending = undefined
      clearTimeout(current?.timer)
      if (!current) {
        failure ??= new Error('Unexpected custom reporter response.')
        controller.abort(failure)
      } else if (error && !asynchronousCloseFailure) current.reject(error)
      else current.resolve()
    },
    onOutput(stream, chunk) {
      ;(stream === 'stderr'
        ? (options.writeError ?? options.write)
        : options.write)(chunk.toString())
    },
  }).then(
    (result) => {
      closed = true
      if (
        !(result.reason === 'cancelled' && options.signal?.aborted) &&
        !(
          closing &&
          initialCloseFailure &&
          result.reason === 'exit' &&
          result.signal === null
        ) &&
        (!closing || result.reason !== 'exit' || result.code !== 0)
      ) {
        const error = new Error(
          `Custom reporter process ended unexpectedly (${result.reason}, code ${result.code}).`
        )
        const reportedShutdownFailure =
          closing &&
          shutdownResponseFailure !== undefined &&
          ((result.reason === 'exit' && result.code === 1) ||
            (result.reason === 'cancelled' &&
              controller.signal.reason === shutdownResponseFailure))
        if (!reportedShutdownFailure && publicationExitFailure === undefined) {
          publicationExitFailure = error
          publicationExitCause =
            result.reason === 'cancelled' ? controller.signal.reason : undefined
        }
        failure ??= error
      }
      clearTimeout(pending?.timer)
      pending?.reject(
        failure ??
          options.signal?.reason ??
          new Error('Custom reporter process closed.')
      )
      pending = undefined
      rejectRecordRequests(
        failure ??
          options.signal?.reason ??
          new Error('Custom reporter process closed.')
      )
    },
    (error) => {
      closed = true
      rejectRecordRequests(error)
      publicationExitFailure ??= error
      failure ??= error
      retainCancellationFailure(error)
      clearTimeout(pending?.timer)
      pending?.reject(error)
      pending = undefined
    }
  )
  async function request(
    message: { type: string; [key: string]: unknown },
    shutdown = false,
    invoked?: (receipt: CustomReporterInvocation) => void,
    prefix?: (receipt: CustomReporterCompletionPrefix) => void
  ) {
    if (options.signal?.aborted) throw failure ?? options.signal.reason
    if (pending || closed || (closing && !shutdown))
      throw failure ?? new Error('Custom reporter session is unavailable.')
    if (failure && !shutdown) throw failure
    const result = response(message.type, invoked, prefix)
    void send(message).catch((error) => {
      failure ??= error
      retainCancellationFailure(error)
      clearTimeout(pending?.timer)
      pending?.reject(error)
      pending = undefined
      controller.abort(error)
    })
    try {
      await result
    } catch (error) {
      deliveredFailure = error
      throw error
    }
  }
  function dispose({
    handledFailure,
    exitCodeSnapshot,
  }: {
    handledFailure?: unknown
    exitCodeSnapshot?: { value?: number | string }
  } = {}) {
    const handled =
      handledFailure !== undefined && handledFailure === deliveredFailure
        ? handledFailure
        : undefined
    return (disposal ??= (async () => {
      await Promise.all([
        ...queuedWrites,
        ...collectedWrites,
        ...preparationWrites,
      ])
      await consoleQueue
      if (recordWrites.size) await Promise.allSettled([...recordWrites])
      closing = true
      const cleanupErrors: unknown[] = []
      if (!closed && !controller.signal.aborted && !terminalWatchFailure) {
        try {
          await request(
            {
              type: 'shutdown',
              ...(exitCodeSnapshot ? { exitCodeSnapshot } : {}),
            },
            true
          )
        } catch (error) {
          cleanupErrors.push(error)
          if (error !== initialCloseFailure?.error) controller.abort(error)
        }
      }
      await exit
      options.signal?.removeEventListener('abort', abort)
      if (options.signal?.aborted) {
        for (const error of cleanupErrors) retainCancellationFailure(error)
        await settleCancellation(true)
        return
      }
      const ownedCleanupErrors =
        handled === undefined
          ? cleanupErrors
          : cleanupErrors.filter((error) => error !== handled)
      if (
        handled !== undefined &&
        publicationExitFailure !== undefined &&
        publicationExitFailure !== handled &&
        publicationExitCause !== handled &&
        !ownedCleanupErrors.includes(publicationExitFailure)
      )
        ownedCleanupErrors.push(publicationExitFailure)
      if (ownedCleanupErrors.length) {
        if (
          failure &&
          failure !== handled &&
          !ownedCleanupErrors.includes(failure)
        )
          ownedCleanupErrors.unshift(failure)
        if (ownedCleanupErrors.length === 1) throw ownedCleanupErrors[0]
        throw new AggregateError(
          ownedCleanupErrors,
          'Custom reporter cleanup failed.'
        )
      }
      if (failure && failure !== deliveredFailure && failure !== handled)
        throw failure
    })())
  }
  try {
    await loaded
    return {
      get initialCloseFailure() {
        return initialCloseFailure
      },
      get captureRunStart() {
        return captureRunStart
      },
      async beginRun(
        specifications: readonly ReporterRunSpecification[],
        coverage = false
      ) {
        if (!captureRunStart || options.watch || closing || closed)
          throw new Error('Run Start reporter session is unavailable.')
        await consoleQueue
        if (consoleFailure) throw consoleFailure
        await request({
          type: 'run-start',
          specifications,
          ...(coverage ? { coverage: true } : {}),
        })
      },
      get captureCaseReady() {
        return captureCaseReady
      },
      get captureModuleStart() {
        return captureModuleStart
      },
      get captureModuleCollected() {
        return captureModuleCollected
      },
      get captureModuleQueued() {
        return captureModuleQueued
      },
      onModuleQueued(entry: TestEntry) {
        if (!captureModuleQueued || options.watch || closing || closed)
          throw new Error('Queued module reporter session is unavailable.')
        queuedWrites.push(
          send({
            type: 'module-queued',
            entry: {
              id: entry.id,
              file: entry.file,
              ...(entry.projectName === undefined
                ? {}
                : { projectName: entry.projectName }),
            },
          }).catch(retainConsoleFailure)
        )
      },
      get captureTestRecords() {
        return captureTestRecords
      },
      async onTestRecord(
        event: TestRecordEvent
      ): Promise<TestArtifact | undefined> {
        if (!captureTestRecords || options.watch || closing || closed)
          throw new Error(
            'Test record reporter requires its actual one-shot owner.'
          )
        await consoleQueue
        if (consoleFailure) throw consoleFailure
        controller.signal.throwIfAborted()
        if (failure) throw failure
        if (closing || closed)
          throw new Error('Test record reporter session closed.')
        const recordId = ++nextRecordId
        const result = new Promise<TestArtifact | undefined>(
          (resolve, reject) => {
            const timer = setTimeout(() => {
              recordRequests.delete(recordId)
              reject(new Error('Custom reporter record request timed out.'))
            }, 120000)
            recordRequests.set(recordId, { event, resolve, reject, timer })
          }
        )
        recordWrites.add(result)
        void result.then(
          () => recordWrites.delete(result),
          () => recordWrites.delete(result)
        )
        void send({ type: 'test-record', recordId, event }).catch((error) => {
          const record = recordRequests.get(recordId)
          if (record) {
            recordRequests.delete(recordId)
            clearTimeout(record.timer)
            record.reject(error)
          }
          failure ??= error
          controller.abort(error)
        })
        return result
      },
      get captureTaskResults() {
        return captureTaskResults
      },
      async beginWatchRun(input?: {
        rerun?: { files: string[]; trigger?: string }
      }) {
        if (!options.watch)
          throw new Error(
            'Persistent reporter generations require watch ownership.'
          )
        await consoleQueue
        if (consoleFailure) throw consoleFailure
        await request({ type: 'watch-begin', ...input })
        observedModules.clear()
      },
      async readyWatchRun(initial: boolean): Promise<Error | undefined> {
        if (!options.watch)
          throw new Error('Reporter readiness requires watch ownership.')
        await consoleQueue
        if (consoleFailure) throw consoleFailure
        watchHookError = undefined
        await request({ type: 'watch-ready', initial })
        return watchHookError
      },
      async removeWatchTests(removedFiles: string[]) {
        if (!options.watch)
          throw new Error('Reporter removal requires watch ownership.')
        await consoleQueue
        if (consoleFailure) throw consoleFailure
        await request({ type: 'watch-removed', files: removedFiles })
      },
      async replayFile(
        taskTree: ReporterTaskSnapshot,
        completion: CustomReporterCompletion,
        caseEvents?: ReporterCaseEvent[]
      ) {
        await consoleQueue
        if (consoleFailure) throw consoleFailure
        if (captureTestRecords)
          throw new Error(
            'Test record reporter replay requires actual record RPC ownership and is not implemented.'
          )
        await request({
          type: 'replay-file',
          taskTree,
          completion,
          ...(caseEvents === undefined ? {} : { caseEvents }),
        })
      },
      async replayImportedFile(
        taskTree: ReporterTaskSnapshot,
        relativeModuleId: string
      ) {
        await consoleQueue
        if (consoleFailure) throw consoleFailure
        if (captureTestRecords)
          throw new Error(
            'Test record reporter replay requires actual record RPC ownership and is not implemented.'
          )
        await request({ type: 'imported-file', taskTree, relativeModuleId })
      },
      async finishImportedRun(
        moduleIds: string[],
        errors: unknown[],
        status: 'passed' | 'failed'
      ) {
        await consoleQueue
        if (consoleFailure) throw consoleFailure
        await request({ type: 'imported-finish', moduleIds, errors, status })
      },
      async drainConsole() {
        await consoleQueue
        if (consoleFailure) throw consoleFailure
      },
      async collectErrors() {
        await consoleQueue
        if (options.signal?.aborted) {
          await settleCancellation()
          return structuredClone(reporterErrors)
        }
        if (consoleFailure) throw consoleFailure
        // A completed authored callback may have failed while its owned
        // reporter realm remains available until the existing shutdown.
        await request({ type: 'reporter-errors' }, true)
        return structuredClone(reporterErrors)
      },
      onSnapshotPreparationFailure(
        preparationFailure: SnapshotPreparationFailure
      ) {
        if (preparedEntries.has(preparationFailure.entryId))
          throw new Error(
            'Duplicate snapshot preparation reporter association.'
          )
        preparedEntries.add(preparationFailure.entryId)
        preparationWrites.push(
          send({
            type: 'snapshot-preparation-failure',
            entryId: preparationFailure.entryId,
          }).catch(retainConsoleFailure)
        )
      },
      onEvent(event: ResultEvent, completion?: CustomReporterCompletion) {
        if (options.signal?.aborted) return
        if (
          (event.type === 'file-end' || event.type === 'module-complete') &&
          preparedEntries.has(event.entryId)
        )
          return
        if (event.type === 'module-complete') {
          if (!completion)
            throw new Error('Live module reporter requires actual file facts.')
          if (!captureTaskResults || observedModules.has(event.entryId))
            throw new Error(
              'Module reporter requires one actual disposed file.'
            )
          observedModules.add(event.entryId)
          consoleQueue = consoleQueue
            .then(() =>
              request({
                type: 'module-end',
                entryId: event.entryId,
                completion,
              })
            )
            .catch(retainConsoleFailure)
          return
        }
        if (event.type === 'file-collected' || event.type === 'task-update') {
          // Producer facts stay live while owned reporter callbacks await work.
          const notification = send(
            event.type === 'task-update' &&
              event.kind === 'task-packs-after-collection-failure'
              ? {
                  type: 'task-packs',
                  entryId: event.entryId,
                  taskPacks: event.taskPacks,
                }
              : {
                  type: 'task-state',
                  taskTree: event.taskTree,
                  ...(captureModuleStart
                    ? {
                        runId: event.runId,
                        entryId: event.entryId,
                        revision: event.revision,
                      }
                    : {}),
                  ...(event.type === 'file-collected' && captureModuleCollected
                    ? { notifyCollected: true }
                    : {}),
                  ...(event.type === 'task-update'
                    ? { taskUpdateIds: event.taskUpdateIds }
                    : {}),
                }
          ).catch(retainConsoleFailure)
          if (event.type === 'file-collected' && captureModuleCollected)
            collectedWrites.push(notification)
          if (event.type === 'task-update')
            for (const occurrence of event.caseEvents ??
              event.caseResults.map((result) => ({
                event: 'result' as const,
                caseId: result.caseId,
              }))) {
              if (occurrence.event === 'ready' && !captureCaseReady) continue
              consoleQueue = consoleQueue
                .then(() =>
                  request({
                    type: 'case-' + occurrence.event,
                    entryId: event.entryId,
                    caseId: occurrence.caseId,
                  })
                )
                .catch(retainConsoleFailure)
            }
          return
        }
        if (event.type === 'file-end') {
          if (!completion)
            throw new Error(
              'Module reporters require the completed file results.'
            )
          consoleQueue = consoleQueue
            .then(() =>
              request({
                type: observedModules.has(event.entryId)
                  ? 'module-state'
                  : 'module-end',
                entryId: event.entryId,
                completion,
              })
            )
            .catch(retainConsoleFailure)
          return
        }
        if (event.type !== 'output' || !event.console) return
        const log = event.console.browser
          ? {
              origin: event.console.origin,
              // Browser output adds one transport line terminator to the raw format.
              content: event.text.slice(0, -1),
              browser: true,
              time: event.timestamp,
              taskId: event.console.taskId,
              type: event.stream,
              size: event.console.size,
            }
          : {
              type: event.stream,
              content: event.text || '<empty line>',
              taskId: event.console.taskId,
              time: event.timestamp,
              size: event.console.size,
              origin: event.console.origin,
            }
        consoleQueue = consoleQueue
          .then(() => request({ type: 'console', log }))
          .catch(retainConsoleFailure)
      },
      beginFinish(completion: CustomReporterCompletion): {
        invoked: Promise<CustomReporterInvocation | undefined>
        completed: Promise<void>
        prefix?: Promise<CustomReporterCompletionPrefix | undefined>
      } {
        let resolveInvoked!: (receipt?: CustomReporterInvocation) => void
        let rejectInvoked!: (error: unknown) => void
        const invoked = new Promise<CustomReporterInvocation | undefined>(
          (resolve, reject) => {
            resolveInvoked = resolve
            rejectInvoked = reject
          }
        )
        let resolvePrefix!: (receipt?: CustomReporterCompletionPrefix) => void
        let rejectPrefix!: (error: unknown) => void
        const prefix = new Promise<CustomReporterCompletionPrefix | undefined>(
          (resolve, reject) => {
            resolvePrefix = resolve
            rejectPrefix = reject
          }
        )
        // All waiters own flush/transport/abort rejection immediately.
        void invoked.catch(() => {})
        void prefix.catch(() => {})
        const completed = (async () => {
          await Promise.all([
            ...queuedWrites,
            ...collectedWrites,
            ...preparationWrites,
          ])
          await consoleQueue
          if (options.signal?.aborted) {
            await settleCancellation()
            throw options.signal.reason
          }
          if (consoleFailure) throw consoleFailure
          await request(
            {
              type: 'finish-begin',
              completion,
              ...completionExitCode(completion),
            },
            false,
            resolveInvoked,
            resolvePrefix
          )
        })()
        // A completed operation with no end hook is honest absence, not a call receipt.
        // Flush, transport, worker-exit and abort failures wake both owned waiters.
        void completed.then(
          () => {
            resolveInvoked()
            resolvePrefix()
          },
          (error) => {
            rejectInvoked(error)
            rejectPrefix(error)
          }
        )
        return { invoked, completed, prefix }
      },
      async finish(completion: CustomReporterCompletion) {
        await Promise.all([
          ...queuedWrites,
          ...collectedWrites,
          ...preparationWrites,
        ])
        await consoleQueue
        if (options.signal?.aborted) {
          await settleCancellation()
          return
        }
        if (consoleFailure) throw consoleFailure
        await request({
          type: 'finish',
          completion,
          ...completionExitCode(completion),
        })
      },
      dispose,
    }
  } catch (error) {
    deliveredFailure = error
    try {
      await dispose()
    } catch (cleanupError) {
      if (cleanupError !== error)
        throw new AggregateError(
          [error, cleanupError],
          'Custom reporter initialization and cleanup failed.'
        )
    }
    throw error
  }
}
