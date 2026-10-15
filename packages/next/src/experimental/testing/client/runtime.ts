import { initializeTestFile } from '../runner'
import { processError } from '../../../compiled/next-test-primitives/error'
import { installBrowserSnapshotBridge } from './snapshot-environment'
import { createClientSourceMapResolver } from './source-maps'
import type { ClientConfiguration, ClientPayload } from './protocol'

/** Called only by the actual native evaluated client entry, before its spec. */
export async function startClientTest(load: () => unknown | Promise<unknown>) {
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
      return (await response.json()).value
    })
    queue = result.catch((error) => {
      transportFailure ??= error
    })
    return result
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
  installBrowserSnapshotBridge({
    request: (method, args) => send({ type: 'snapshot', method, args }),
    mapLocation: mapper.mapLocation,
  })
  try {
    file = initializeTestFile({
      fileId: config.entryId,
      filePath: config.filePath,
      snapshotUpdateMode: config.snapshotUpdateMode,
      resourceLifetime: 'file',
      onUnhandledRejection: report,
    })
    await file.collect(async () => load())
    file.validateBrowserClient({
      testNamePattern: config.testNamePattern,
      allowOnly: config.allowOnly,
    })
    const runResult = await file.run({
      runId: config.runId,
      signal: new AbortController().signal,
      testTimeout: config.testTimeout,
      hookTimeout: config.hookTimeout,
      testNamePattern: config.testNamePattern,
      allowOnly: config.allowOnly,
      onLateFailure: report,
      onUnhandledFailure: report,
      async onCaseStart(context) {
        await send({
          type: 'case-start',
          context: {
            id: context.id,
            fileId: context.fileId,
            testId: context.testId,
            name: context.name,
            retry: context.retry,
            repeat: context.repeat,
          },
        })
      },
      async onCaseEnd(result) {
        await send({
          type: 'case-end',
          result: {
            ...result,
            errors: result.errors.map((failure) => ({
              ...failure,
              error: processError(failure.error),
            })),
          },
        })
      },
      async onSuiteEnd(result) {
        await send({
          type: 'suite-end',
          result: {
            ...result,
            errors: result.errors.map((failure) => ({
              ...failure,
              error: processError(failure.error),
            })),
          },
        })
      },
    })
    caseCount = runResult.cases.length
    interrupted = runResult.interrupted
    for (const failure of runResult.errors) report(failure.error)
    status =
      !interrupted &&
      !runResult.errors.length &&
      runResult.cases.every(
        (test) => test.status === 'passed' || test.status === 'skipped'
      )
        ? 'passed'
        : 'failed'
  } catch (error) {
    report(error)
  }
  try {
    await file?.dispose()
  } catch (error) {
    report(error)
    status = 'failed'
  }
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
  // immutable page owner; no later test or attempt can be active in the realm.
  await new Promise<void>((resolve) => realSetTimeout(resolve, 0))
  if (pendingFailures.length) {
    status = 'failed'
    updates = []
  }
  for (const error of pendingFailures)
    await send({ type: 'failure', error: processError(error) })
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
}
