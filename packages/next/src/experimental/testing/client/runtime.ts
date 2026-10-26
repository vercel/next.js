import { captureReporterTaskTree } from '../reporting/live-tasks'
import { createReporterTaskUpdates } from '../reporting/task-updates'
import type { RuntimeModuleCompletion } from '../execution/completed-module'
import {
  initializeTestFile,
  getConsoleTask,
  getCurrentConsoleTask,
} from '../runner'
import { configureBrowserEnv } from './env'
import { getFinalCaseResults } from '../reporting/final-cases'
import { processError } from '../../../compiled/next-test-primitives/error'
import { installBrowserSnapshotBridge } from './snapshot-environment'
import { createClientSourceMapResolver } from './source-maps'
import type { ClientConfiguration, ClientPayload } from './protocol'
import { clientCaseFinal } from './protocol'
import {
  initializeBrowserContext,
  cleanupBrowserContext,
  cleanupBrowserKeyboard,
} from './browser-context'
import { installClientConsole } from './console'
import { getClientArtifactLocation } from './artifact-location'
import { getClientDeclarationLocation } from './declaration-location'
import type { TestArtifact } from '../runner/tasks'
import {
  captureClientCommandAdmission,
  nativePromiseResolve,
  nativePromiseThen,
} from './async-context'

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
    (config.includeTaskLocation !== undefined &&
      typeof config.includeTaskLocation !== 'boolean') ||
    (config.captureTaskResults !== undefined &&
      typeof config.captureTaskResults !== 'boolean') ||
    (config.captureCompletedModuleResult !== undefined &&
      config.captureCompletedModuleResult !== true) ||
    (config.caseScheduling !== undefined &&
      config.caseScheduling !== 'concurrent-v1') ||
    (config.userCancellation !== undefined &&
      config.userCancellation !== true) ||
    (config.hookSequence !== undefined &&
      !['stack', 'list', 'parallel'].includes(config.hookSequence)) ||
    (config.sequenceConcurrent !== undefined &&
      typeof config.sequenceConcurrent !== 'boolean') ||
    (config.maxConcurrency !== undefined &&
      (!Number.isSafeInteger(config.maxConcurrency) ||
        config.maxConcurrency < 1)) ||
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
  const nativeReplies = new Set<Promise<void>>()
  const pendingFailures: unknown[] = []
  const workerCleanupFailures: {
    name: unknown
    message: unknown
    stack: unknown
  }[] = []
  let moduleCompletion: RuntimeModuleCompletion | undefined
  let moduleFailurePhase: 'collection' | 'run' | undefined
  let unavailableModule:
    | { phase: 'collection' | 'run'; error: unknown }
    | undefined
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
      if (
        config.caseScheduling === 'concurrent-v1' &&
        nativeReplies.size &&
        (message.type === 'snapshot' ||
          message.type === 'artifact' ||
          (message.type === 'browser-command' && !message.origin))
      )
        await Promise.all([...nativeReplies])
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
        if (config.caseScheduling === 'concurrent-v1' && message.origin) {
          nativeReplies.add(pending)
          void pending.then(() => nativeReplies.delete(pending))
        } else {
          nativeReply = pending
          void pending.then(() => {
            if (nativeReply === pending) nativeReply = undefined
          })
        }
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
  const browserContext = initializeBrowserContext(
    (command, origin) =>
      send({
        type: 'browser-command',
        command,
        ...(origin ? { origin } : {}),
      }),
    {
      getConsoleTask: getCurrentConsoleTask,
      ...(config.caseScheduling === 'concurrent-v1'
        ? { captureCommandAdmission: captureClientCommandAdmission }
        : {}),
    }
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
  const lifetimeController = config.userCancellation
    ? new AbortController()
    : undefined
  let userCancellation:
    | {
        signal: AbortSignal
        finishRun(): void
        close(): Promise<void>
      }
    | undefined
  async function openUserCancellation() {
    const controlFetch = globalThis.fetch.bind(globalThis)
    const controller = new AbortController()
    let active = true,
      delivered = false,
      disposal: Promise<void> | undefined
    const identity = {
      version: config.version,
      runId: config.runId,
      entryId: config.entryId,
      revision: config.revision,
      ownerToken: config.ownerToken,
    }
    async function requestControl(
      message: { type: 'wait' } | { type: 'close'; delivered: boolean }
    ) {
      const response = await controlFetch(
        config.rpcURL + '/user-cancellation',
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            Authorization: config.authorization,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ...identity, ...message }),
        }
      )
      if (!response.ok)
        throw new Error('Browser Mode scheduling control failed.')
      return response
    }
    function cancelledReply(value: unknown) {
      if (
        !value ||
        typeof value !== 'object' ||
        Object.keys(value).join(',') !== 'cancelled' ||
        typeof (value as { cancelled?: unknown }).cancelled !== 'boolean'
      )
        throw new Error('Invalid Browser Mode scheduling control reply.')
      return (value as { cancelled: boolean }).cancelled
    }
    // Headers admit this actual owner before collection; the JSON body waits
    // independently of authored fetches and the ordinary result/action FIFO.
    const response = await requestControl({ type: 'wait' })
    const waiting = response.json().then((value) => {
      if (cancelledReply(value) && active) {
        delivered = true
        controller.abort()
      }
    })
    void waiting.catch((error) => {
      report(error)
      lifetimeController!.abort(error)
    })
    return {
      signal: controller.signal,
      finishRun() {
        active = false
      },
      close() {
        return (disposal ??= (async () => {
          const acknowledged = delivered
          const closing = await requestControl({
            type: 'close',
            delivered: acknowledged,
          })
          await waiting
          if (cancelledReply(await closing.json()) !== acknowledged)
            throw new Error('Browser Mode scheduling control close mismatch.')
        })())
      },
    }
  }
  try {
    try {
      if (config.userCancellation)
        userCancellation = await openUserCancellation()
      configureBrowserEnv(config.env, getEnv?.())
      imports = createImports?.()
      file = initializeTestFile({
        publicTaskSelection: true,
        fileId: config.entryId,
        filePath: config.filePath,
        ...(config.includeTaskLocation
          ? {
              getTaskLocation: (error: Error) =>
                getClientDeclarationLocation(error, mapper),
            }
          : {}),
        snapshotUpdateMode: config.snapshotUpdateMode,
        resourceLifetime: 'file',
        waitForImports: imports?.waitForImports,
        retry: config.retry,
        ...(config.sequenceConcurrent === undefined
          ? {}
          : { sequence: { concurrent: config.sequenceConcurrent } }),
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
      file.enableBrowserPublicTaskQueues()
      if (config.captureCompletedModuleResult) moduleFailurePhase = 'collection'
      await file.collect(async () => {
        browserContext.install()
        await moduleMocks?.register()
        await loadSetupModules?.()
        return load()
      })
      moduleFailurePhase = undefined
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
        caseScheduling: config.caseScheduling,
        fixtureResources: 'file-v1',
      })
      if (!taskUpdates) await send({ type: 'collected', declarations })
      if (config.captureCompletedModuleResult) moduleFailurePhase = 'run'
      const runResult = await file.run({
        ...(config.captureCompletedModuleResult
          ? { captureCompletedModuleResult: true as const }
          : {}),
        runId: config.runId,
        ...(config.projectName === undefined
          ? {}
          : { projectName: config.projectName }),
        signal: lifetimeController?.signal ?? new AbortController().signal,
        ...(userCancellation
          ? { userCancelSignal: userCancellation.signal }
          : {}),
        testTimeout: config.testTimeout,
        hookTimeout: config.hookTimeout,
        ...(config.hookSequence === undefined &&
        config.sequenceConcurrent === undefined
          ? {}
          : {
              sequence: {
                ...(config.hookSequence === undefined
                  ? {}
                  : { hooks: config.hookSequence }),
                ...(config.sequenceConcurrent === undefined
                  ? {}
                  : { concurrent: config.sequenceConcurrent }),
              },
            }),
        ...(config.maxConcurrency === undefined
          ? {}
          : { maxConcurrency: config.maxConcurrency }),
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
        onCaseResult:
          config.caseScheduling === 'concurrent-v1' || taskUpdates
            ? (task, result) => {
                if (config.caseScheduling === 'concurrent-v1')
                  void send({
                    type: 'case-final',
                    result: clientCaseFinal(result),
                  }).catch(report)
                if (!taskUpdates) return
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
      moduleFailurePhase = undefined
      const finalCases = [...getFinalCaseResults(runResult.cases).values()]
      if (config.captureCompletedModuleResult) {
        const completed = file.getCompletedModuleResult()
        if (!completed)
          throw new Error('Actual fulfilled module completion is missing.')
        moduleCompletion = {
          ...completed,
          version: 1,
          resultVersion: completed.version,
          kind: 'fulfilled',
          runId: config.runId,
          entryId: config.entryId,
          revision: config.revision,
        }
      }
      caseCount = finalCases.length
      interrupted =
        runResult.interrupted || userCancellation?.signal.aborted === true
      for (const failure of runResult.errors) report(failure.error)
      status =
        (!interrupted || userCancellation?.signal.aborted) &&
        !runResult.errors.length &&
        finalCases.every(
          (test) => test.status === 'passed' || test.status === 'skipped'
        )
          ? 'passed'
          : 'failed'
    } catch (error) {
      if (moduleFailurePhase)
        unavailableModule = { phase: moduleFailurePhase, error }
      report(error)
    } finally {
      userCancellation?.finishRun()
    }
    let browserCleanup: Promise<void> | undefined
    const cleanupBrowserResources = () => {
      if (!browserCleanup)
        browserCleanup = nativePromiseThen.call(
          nativePromiseResolve(),
          async () => {
            for (const cleanup of [
              cleanupBrowserContext,
              cleanupBrowserKeyboard,
            ]) {
              try {
                await cleanup()
              } catch (error) {
                report(error)
                status = 'failed'
              }
            }
          }
        ) as Promise<void>
      return browserCleanup
    }
    for (const dispose of [
      ...(taskUpdates
        ? [() => taskUpdates.finish(), () => taskUpdates.dispose()]
        : []),
      async () => {
        try {
          await file?.dispose({
            beforeOwnedWorkerDispose: cleanupBrowserResources,
          })
        } catch (error) {
          if (!file?.takeOwnedWorkerDisposalFailure?.(error)) throw error
          const value = Object(error)
          workerCleanupFailures.push({
            name: Reflect.get(value, 'name'),
            message: Reflect.get(value, 'message'),
            stack: Reflect.get(value, 'stack'),
          })
          status = 'failed'
        }
      },
      // Joined fallback for failed initialization or older file implementations.
      cleanupBrowserResources,
      () => imports?.dispose(),
      ...(userCancellation ? [() => userCancellation!.close()] : []),
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
    if (!pendingFailures.length && status === 'passed' && !interrupted) {
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
    for (const error of pendingFailures) {
      const failure = processError(error)
      if (unavailableModule && unavailableModule.error === error)
        moduleCompletion = {
          version: 1,
          runId: config.runId,
          entryId: config.entryId,
          revision: config.revision,
          kind: 'unavailable',
          phase: unavailableModule.phase,
          failure,
        }
      await send({ type: 'failure', error: failure })
    }
    for (const error of workerCleanupFailures)
      await send({ type: 'failure', origin: 'worker-fixture-cleanup', error })
    restoreConsole()
    terminalPublished = true
    await send({
      type: 'complete',
      ...(moduleCompletion ? { moduleCompletion } : {}),
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
