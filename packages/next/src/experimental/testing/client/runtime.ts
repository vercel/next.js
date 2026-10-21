import { captureReporterTaskTree } from '../reporting/live-tasks'
import { createReporterTaskUpdates } from '../reporting/task-updates'
import { initializeTestFile, getConsoleTask } from '../runner'
import { configureBrowserEnv } from './env'
import { getFinalCaseResults } from '../reporting/final-cases'
import { processError } from '../../../compiled/next-test-primitives/error'
import { installBrowserSnapshotBridge } from './snapshot-environment'
import { createClientSourceMapResolver } from './source-maps'
import type { ClientConfiguration, ClientPayload } from './protocol'
import {
  initializeBrowserContext,
  cleanupBrowserContext,
  cleanupBrowserKeyboard,
} from './browser-context'
import { installClientConsole } from './console'
import { getClientArtifactLocation } from './artifact-location'
import type { TestArtifact } from '../runner/tasks'

/** Called only by the actual native evaluated client entry, before its spec. */
export async function startClientTest(
  load: () => unknown | Promise<unknown>,
  moduleMocks?: {
    initialize(onLateFailure: (error: Error) => void): { dispose(): void }
    register(): unknown | Promise<unknown>
  },
  createImports?: () => {
    waitForImports(): Promise<void>
    dispose(): void
  },
  getEnv?: () => Record<string, string | boolean | undefined>,
  loadSetupModules?: () => unknown | Promise<unknown>
) {
  const configURL = new URL('config', location.href)
  const configResponse = await fetch(configURL, {
    credentials: 'same-origin',
    cache: 'no-store',
  })
  if (!configResponse.ok) throw new Error('Browser Mode configuration failed.')
  const config = (await configResponse.json()) as ClientConfiguration
  if (
    (config.captureTaskResults !== undefined &&
      typeof config.captureTaskResults !== 'boolean') ||
    config.version !== 1 ||
    !config.ownerToken ||
    !config.authorization ||
    !/^[a-f0-9]{64}$/.test(config.sourceHash)
  )
    throw new Error('Invalid Browser Mode owner configuration.')
  // processError mutates assertion values; logical facts reuse their attempt serialization.
  const serializedErrors = config.captureTaskResults
    ? new WeakMap<object, ReturnType<typeof processError>>()
    : undefined
  const taskUpdates = config.captureTaskResults
    ? createReporterTaskUpdates({
        onUpdate(update) {
          return send({
            type: 'task-update',
            ...update,
            caseResults: update.caseResults,
          }).then(() => {})
        },
      })
    : undefined
  const realDateNow = Date.now.bind(Date)
  const realSetTimeout = globalThis.setTimeout.bind(globalThis)
  let terminalPublished = false
  let sequence = 0,
    queue: Promise<unknown> = Promise.resolve(),
    nativeReply: Promise<void> | undefined,
    transportFailure: unknown
  const pendingFailures: unknown[] = []
  const failures = new Set<unknown>()
  const payload = (message: ClientPayload) => ({
    ...message,
    version: 1,
    runId: config.runId,
    entryId: config.entryId,
    revision: config.revision,
    ownerToken: config.ownerToken,
    sequence: sequence++,
  })
  type ClientReply = {
    value: unknown
    actionError?: { name: string; message: string; stack?: string }
    artifactError?: { key: string; value?: unknown }[]
  }
  function request(message: ClientPayload, body: () => string) {
    const opened = queue.then(async () => {
      // Observational updates share one FIFO slot while the native reply is pending.
      const observational =
        message.type === 'output' ||
        (config.captureTaskResults === true && message.type === 'task-update')
      if (!observational && nativeReply) await nativeReply
      if (transportFailure) throw transportFailure
      const response = await fetch(config.rpcURL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Authorization: config.authorization,
          'Content-Type': 'application/json',
        },
        body: body(),
      })
      if (!response.ok) throw new Error('Browser Mode RPC failed.')
      const reply = Promise.resolve(response.json())
        .then((value) => {
          if (value && typeof value === 'object' && 'error' in value)
            throw new Error('Browser Mode RPC failed.')
          return value as ClientReply
        })
        .catch((error) => {
          transportFailure ??= error
          throw error
        })
      // Header admission must never leave a started response body unobserved.
      void reply.catch(() => {})
      if (message.type === 'browser-command') {
        const pending = reply.then(
          () => {},
          () => {}
        )
        nativeReply = pending
        void pending.then(() => {
          if (nativeReply === pending) nativeReply = undefined
        })
      }
      return { reply }
    })
    queue = opened
      .then(async ({ reply }) => {
        if (message.type !== 'browser-command') await reply
      })
      .catch((error) => {
        transportFailure ??= error
      })
    return opened.then(({ reply }) => reply)
  }
  function send(message: Parameters<typeof payload>[0]): Promise<unknown> {
    const value = payload(message)
    let snapshot: { body: string } | { error: unknown }
    try {
      snapshot = { body: JSON.stringify(value) }
    } catch (error) {
      snapshot = { error }
    }
    return request(message, () => {
      if ('error' in snapshot) throw snapshot.error
      return snapshot.body
    }).then((reply) => {
      if (reply.actionError) {
        const error = new Error(reply.actionError.message)
        error.name = reply.actionError.name
        if (reply.actionError.stack) error.stack = reply.actionError.stack
        throw error
      }
      return reply.value
    })
  }
  function sendArtifact(
    message: Extract<ClientPayload, { type: 'artifact' }>
  ): Promise<TestArtifact> {
    const value = payload(message)
    return request(message, () => JSON.stringify(value)).then((reply) => {
      if (reply.artifactError)
        throw Object.fromEntries(
          reply.artifactError.map(({ key, value: fieldValue }) => [
            key,
            fieldValue,
          ])
        )
      return reply.value as TestArtifact
    })
  }
  function report(reason: unknown) {
    if (failures.has(reason)) return
    failures.add(reason)
    pendingFailures.push(reason)
    if (terminalPublished)
      void send({ type: 'failure', error: processError(reason) }).catch(
        () => {}
      )
  }
  const onError = (event: ErrorEvent) => {
    event.preventDefault()
    report(event.error ?? new Error(event.message))
  }
  const onRejection = (event: PromiseRejectionEvent) => {
    event.preventDefault()
    report(event.reason)
  }
  addEventListener('error', onError)
  addEventListener('unhandledrejection', onRejection)
  let file: ReturnType<typeof initializeTestFile> | undefined,
    status: 'passed' | 'failed' = 'failed',
    interrupted = false,
    caseCount = 0
  let updates: ReturnType<
      ReturnType<typeof initializeTestFile>['takeSnapshotUpdates']
    > = [],
    snapshotSummary: unknown
  const mapper = createClientSourceMapResolver(config)
  const browserContext = initializeBrowserContext((command) =>
    send({ type: 'browser-command', command })
  )
  let mocks: { dispose(): void } | undefined
  let imports: ReturnType<NonNullable<typeof createImports>> | undefined
  installBrowserSnapshotBridge({
    request: (method, args) => send({ type: 'snapshot', method, args }),
    mapLocation: mapper.mapLocation,
  })
  const restoreConsole = installClientConsole(console, (stream, text) => {
    void send({
      type: 'output',
      stream,
      text,
      time: realDateNow(),
      console: {
        taskId: getConsoleTask()?.taskId ?? '__vitest__unknown_test__',
        size: text.length - 1,
        browser: true,
      },
    }).catch(report)
  })
  try {
    try {
      configureBrowserEnv(config.env, getEnv?.())
      imports = createImports?.()
      file = initializeTestFile({
        fileId: config.entryId,
        filePath: config.filePath,
        snapshotUpdateMode: config.snapshotUpdateMode,
        resourceLifetime: 'file',
        waitForImports: imports?.waitForImports,
        retry: config.retry,
        fakeTimers: config.fakeTimers,
        provide: config.provide,
        globals: config.globals,
        clearMocks: config.clearMocks,
        mockReset: config.mockReset,
        restoreMocks: config.restoreMocks,
        unstubGlobals: config.unstubGlobals,
        unstubEnvs: config.unstubEnvs,
        onUnhandledRejection: report,
      })
      mocks = moduleMocks?.initialize(report)
      await file.collect(async () => {
        browserContext.install()
        await moduleMocks?.register()
        await loadSetupModules?.()
        return load()
      })
      const declarations = file.validateBrowserClient({
        testNamePattern:
          config.testNamePattern === undefined
            ? undefined
            : new RegExp(
                config.testNamePattern.source,
                config.testNamePattern.flags
              ),
        allowOnly: config.allowOnly,
        retry: config.retry,
      })
      if (!taskUpdates) await send({ type: 'collected', declarations })
      const runResult = await file.run({
        runId: config.runId,
        ...(config.projectName === undefined
          ? {}
          : { projectName: config.projectName }),
        signal: new AbortController().signal,
        testTimeout: config.testTimeout,
        hookTimeout: config.hookTimeout,
        testNamePattern:
          config.testNamePattern === undefined
            ? undefined
            : new RegExp(
                config.testNamePattern.source,
                config.testNamePattern.flags
              ),
        allowOnly: config.allowOnly,
        retry: config.retry,
        onCollected: taskUpdates
          ? async (actualFile) => {
              await send({
                type: 'collected',
                declarations,
                taskTree: captureReporterTaskTree(actualFile),
              })
              taskUpdates.collected(actualFile)
            }
          : undefined,
        onLateFailure: report,
        onUnhandledFailure: report,
        getArtifactLocation: (error) =>
          getClientArtifactLocation(error, mapper),
        onBrowserArtifact(task, artifact, context) {
          if (artifact.attachments?.length)
            return Promise.reject(
              new Error(
                'Browser Mode test artifact attachments are not supported.'
              )
            )
          return sendArtifact({
            type: 'artifact',
            taskId: task.id,
            attempt: context
              ? { id: context.id, retry: context.retry, repeat: context.repeat }
              : undefined,
            artifact,
          })
        },
        async beginAttempt() {
          await cleanupBrowserKeyboard()
          // Held keys survive this attempt; the next attempt or file closes them.
          return { async finalize() {}, async dispose() {} }
        },
        onCaseStart(context) {
          taskUpdates?.caseStart(context.testId)
          void send({
            type: 'case-start',
            context: {
              id: context.id,
              fileId: context.fileId,
              testId: context.testId,
              name: context.name,
              retry: context.retry,
              repeat: context.repeat,
            },
          }).catch(report)
        },
        onCaseEnd(result) {
          void send({
            type: 'case-end',
            result: {
              ...result,
              errors: result.errors.map((failure) => {
                const error = processError(failure.error)
                if (failure.error && typeof failure.error === 'object')
                  serializedErrors?.set(failure.error, error)
                return { ...failure, error }
              }),
            },
          }).catch(report)
        },
        onCaseResult: taskUpdates
          ? (task, result) => {
              // The real callback owns these immutable logical outcome facts;
              // later task metadata packs have their separate actual identity.
              const snapshot = JSON.parse(
                JSON.stringify({
                  ...result,
                  errors: result.errors.map((failure) => ({
                    ...failure,
                    error:
                      failure.error && typeof failure.error === 'object'
                        ? (serializedErrors?.get(failure.error) ??
                          processError(failure.error))
                        : processError(failure.error),
                  })),
                })
              )
              taskUpdates.caseResult(task, snapshot)
            }
          : undefined,
        onSuiteEnd(result, task) {
          taskUpdates?.suiteEnd(task)
          void send({
            type: 'suite-end',
            result: {
              ...result,
              errors: result.errors.map((failure) => ({
                ...failure,
                error: processError(failure.error),
              })),
            },
          }).catch(report)
        },
      })
      const finalCases = [...getFinalCaseResults(runResult.cases).values()]
      caseCount = finalCases.length
      interrupted = runResult.interrupted
      for (const failure of runResult.errors) report(failure.error)
      status =
        !interrupted &&
        !runResult.errors.length &&
        finalCases.every(
          (test) => test.status === 'passed' || test.status === 'skipped'
        )
          ? 'passed'
          : 'failed'
    } catch (error) {
      report(error)
    }
    for (const dispose of [
      ...(taskUpdates
        ? [() => taskUpdates.finish(), () => taskUpdates.dispose()]
        : []),
      cleanupBrowserContext,
      cleanupBrowserKeyboard,
      () => file?.dispose(),
      () => imports?.dispose(),
    ]) {
      try {
        await dispose()
      } catch (error) {
        report(error)
        status = 'failed'
      }
    }
    try {
      mocks?.dispose()
    } catch (error) {
      report(error)
      status = 'failed'
    }
    browserContext.dispose()
    snapshotSummary = file?.getSnapshotSummary()
    if (!pendingFailures.length && status === 'passed') {
      try {
        updates = file?.takeSnapshotUpdates() ?? []
      } catch (error) {
        report(error)
        status = 'failed'
      }
    }
    // A real browser turn surfaces queued task/rejection failures under this same
    // immutable page owner after every declared attempt and suite has closed.
    await new Promise<void>((resolve) => realSetTimeout(resolve, 0))
    if (pendingFailures.length) {
      status = 'failed'
      updates = []
    }
    for (const error of pendingFailures)
      await send({ type: 'failure', error: processError(error) })
    restoreConsole()
    terminalPublished = true
    await send({
      type: 'complete',
      status,
      interrupted,
      caseCount,
      updates,
      snapshotSummary,
    })
    // Keep error handlers installed until the parent closes this owned page. Any
    // terminal-after-output failure attempts another message and poisons transport.
  } finally {
    taskUpdates?.dispose()
    restoreConsole()
  }
}
