import { initializeTestFile } from '../runner'
import { configureBrowserEnv } from './env'
import { getFinalCaseResults } from '../reporting/final-cases'
import { processError } from '../../../compiled/next-test-primitives/error'
import { installBrowserSnapshotBridge } from './snapshot-environment'
import { createClientSourceMapResolver } from './source-maps'
import type { ClientConfiguration, ClientPayload } from './protocol'
import {
  initializeBrowserContext,
  cleanupBrowserContext,
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
  getEnv?: () => Record<string, string | boolean | undefined>
) {
  const configURL = new URL('config', location.href)
  const configResponse = await fetch(configURL, {
    credentials: 'same-origin',
    cache: 'no-store',
  })
  if (!configResponse.ok) throw new Error('Browser Mode configuration failed.')
  const config = (await configResponse.json()) as ClientConfiguration
  if (
    config.version !== 1 ||
    !config.ownerToken ||
    !config.authorization ||
    !/^[a-f0-9]{64}$/.test(config.sourceHash)
  )
    throw new Error('Invalid Browser Mode owner configuration.')
  const realSetTimeout = globalThis.setTimeout.bind(globalThis)
  let terminalPublished = false
  let sequence = 0,
    queue: Promise<unknown> = Promise.resolve(),
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
  function send(message: Parameters<typeof payload>[0]): Promise<unknown> {
    const value = payload(message)
    let snapshot: { body: string } | { error: unknown }
    try {
      snapshot = { body: JSON.stringify(value) }
    } catch (error) {
      snapshot = { error }
    }
    const result = queue.then(async () => {
      if (transportFailure) throw transportFailure
      if ('error' in snapshot) throw snapshot.error
      const response = await fetch(config.rpcURL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Authorization: config.authorization,
          'Content-Type': 'application/json',
        },
        body: snapshot.body,
      })
      if (!response.ok) throw new Error('Browser Mode RPC failed.')
      return (await response.json()).value
    })
    queue = result.catch((error) => {
      transportFailure ??= error
    })
    return result
  }
  function sendArtifact(
    message: Extract<ClientPayload, { type: 'artifact' }>
  ): Promise<TestArtifact> {
    const value = payload(message)
    const result = queue.then(async () => {
      if (transportFailure) throw transportFailure
      const response = await fetch(config.rpcURL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Authorization: config.authorization,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(value),
      })
      if (!response.ok) throw new Error('Browser Mode RPC failed.')
      return response.json() as Promise<{
        value: TestArtifact
        artifactError?: { key: string; value?: unknown }[]
      }>
    })
    queue = result.catch((error) => {
      transportFailure ??= error
    })
    return result.then((reply) => {
      if (reply.artifactError)
        throw Object.fromEntries(
          reply.artifactError.map(({ key, value: fieldValue }) => [
            key,
            fieldValue,
          ])
        )
      return reply.value
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
    void send({ type: 'output', stream, text }).catch(report)
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
      await send({ type: 'collected', declarations })
      const runResult = await file.run({
        runId: config.runId,
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
        onCaseStart(context) {
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
              errors: result.errors.map((failure) => ({
                ...failure,
                error: processError(failure.error),
              })),
            },
          }).catch(report)
        },
        onSuiteEnd(result) {
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
      cleanupBrowserContext,
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
    restoreConsole()
  }
}
