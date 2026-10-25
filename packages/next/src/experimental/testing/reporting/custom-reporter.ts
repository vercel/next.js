import { resolve as resolvePath, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runTestProcess } from '../execution/process'
import type { ResultEvent, SerializedDiagnostic } from './events'
import type { CustomReporterCompletion } from './custom-reporter-tasks'
import type { ReporterTaskSnapshot } from './live-tasks'

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
function remoteError(value: SerializedDiagnostic): Error {
  const error = value.errors
    ? new AggregateError(value.errors.map(remoteError), value.message)
    : new Error(
        value.message,
        value.cause ? { cause: remoteError(value.cause) } : undefined
      )
  error.name = value.name ?? 'Error'
  if (value.stack) error.stack = value.stack
  return error
}

export async function openCustomReporters(options: {
  projectDir: string
  reporters: readonly string[]
  /** Retain reporter instances while closed watch generations replace task state. */
  watch?: boolean
  signal?: AbortSignal
  write(text: string): void
  writeError?(text: string): void
}) {
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
        timer?: ReturnType<typeof setTimeout>
      }
    | undefined
  let terminalWatchFailure = false
  let watchHookError: Error | undefined
  let captureTaskResults = false
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
  let disposal: Promise<void> | undefined
  let consoleQueue = Promise.resolve()
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
        : (cancelledReporterErrors ??= reporterErrors.map(remoteError))
    const errors = [
      ...new Set([
        ...callbackErrors,
        consoleFailure,
        failure,
        ...cancellationFailures,
        terminalReporterFailure?.error,
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
  function response(requestType?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      pending = {
        resolve,
        reject,
        requestType,
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
  const exit = runTestProcess(require.resolve('./custom-reporter-worker'), {
    cwd: options.projectDir,
    env: process.env,
    input: {
      files,
      projectDir: options.projectDir,
      ...(options.watch ? { watch: true } : {}),
    },
    signal: controller.signal,
    shutdownGraceMs: 10000,
    onReady(value) {
      send = value
    },
    onMessage(message: any) {
      if (
        message?.type !== 'custom-reporter-result' &&
        message?.type !== 'custom-reporter-failed'
      )
        throw new Error('Invalid custom reporter response.')
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
          ? remoteError(message.error)
          : undefined
      if (error) {
        failure ??= error
        retainCancellationFailure(error)
      }
      const current = pending
      if (
        error &&
        current?.requestType === 'finish' &&
        message.reporterErrors !== undefined
      )
        terminalReporterFailure = { error, reporterErrors }
      pending = undefined
      clearTimeout(current?.timer)
      if (!current) {
        failure ??= new Error('Unexpected custom reporter response.')
        controller.abort(failure)
      } else if (error) current.reject(error)
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
        (!closing || result.reason !== 'exit' || result.code !== 0)
      )
        failure ??= new Error(
          `Custom reporter process ended unexpectedly (${result.reason}, code ${result.code}).`
        )
      clearTimeout(pending?.timer)
      pending?.reject(
        failure ??
          options.signal?.reason ??
          new Error('Custom reporter process closed.')
      )
      pending = undefined
    },
    (error) => {
      closed = true
      failure ??= error
      retainCancellationFailure(error)
      clearTimeout(pending?.timer)
      pending?.reject(error)
      pending = undefined
    }
  )
  async function request(
    message: { type: string; [key: string]: unknown },
    shutdown = false
  ) {
    if (options.signal?.aborted) throw failure ?? options.signal.reason
    if (pending || closed || (closing && !shutdown))
      throw failure ?? new Error('Custom reporter session is unavailable.')
    if (failure && !shutdown) throw failure
    const result = response(message.type)
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
  function dispose() {
    return (disposal ??= (async () => {
      await consoleQueue
      closing = true
      const cleanupErrors: unknown[] = []
      if (!closed && !controller.signal.aborted && !terminalWatchFailure) {
        try {
          await request({ type: 'shutdown' }, true)
        } catch (error) {
          cleanupErrors.push(error)
          controller.abort(error)
        }
      }
      await exit
      options.signal?.removeEventListener('abort', abort)
      if (options.signal?.aborted) {
        for (const error of cleanupErrors) retainCancellationFailure(error)
        await settleCancellation(true)
        return
      }
      if (cleanupErrors.length) {
        if (failure && !cleanupErrors.includes(failure))
          cleanupErrors.unshift(failure)
        if (cleanupErrors.length === 1) throw cleanupErrors[0]
        throw new AggregateError(
          cleanupErrors,
          'Custom reporter cleanup failed.'
        )
      }
      if (failure && failure !== deliveredFailure) throw failure
    })())
  }
  try {
    await loaded
    return {
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
        completion: CustomReporterCompletion
      ) {
        await consoleQueue
        if (consoleFailure) throw consoleFailure
        await request({ type: 'replay-file', taskTree, completion })
      },
      async replayImportedFile(
        taskTree: ReporterTaskSnapshot,
        relativeModuleId: string
      ) {
        await consoleQueue
        if (consoleFailure) throw consoleFailure
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
      onEvent(event: ResultEvent, completion?: CustomReporterCompletion) {
        if (options.signal?.aborted) return
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
          void send({
            type: 'task-state',
            taskTree: event.taskTree,
            ...(event.type === 'task-update'
              ? { taskUpdateIds: event.taskUpdateIds }
              : {}),
          }).catch(retainConsoleFailure)
          if (event.type === 'task-update')
            for (const result of event.caseResults)
              consoleQueue = consoleQueue
                .then(() =>
                  request({
                    type: 'case-result',
                    entryId: event.entryId,
                    caseId: result.caseId,
                  })
                )
                .catch(retainConsoleFailure)
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
      async finish(completion: CustomReporterCompletion) {
        await consoleQueue
        if (options.signal?.aborted) {
          await settleCancellation()
          return
        }
        if (consoleFailure) throw consoleFailure
        await request({ type: 'finish', completion })
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
