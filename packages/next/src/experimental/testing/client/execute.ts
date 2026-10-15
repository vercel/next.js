import { randomBytes } from 'node:crypto'
import type { Browser, BrowserContext, Page } from 'playwright'
import type {
  CompiledBrowserClientTestArtifact,
  ExecuteTestOptions,
  TestExecutionResult,
} from '../contracts'
import { assertArtifactProfile } from '../execution/artifact-profile'
import {
  createBrowserHost,
  connectBrowserHost,
  type BrowserHost,
} from '../browser/host'
import {
  commitSnapshotUpdates,
  resolveSnapshotUpdateMode,
} from '../assertions/snapshots'
import { serializeDiagnostic } from '../reporting/diagnostics'
import { createClientServer } from './server'
import { createClientResultCollector } from './results'

/** Initial client lane: one synchronous case in one immutable, freshly owned page. */
export async function executeClient(
  artifact: CompiledBrowserClientTestArtifact,
  options: ExecuteTestOptions
): Promise<TestExecutionResult> {
  assertArtifactProfile(artifact, options.entry)
  if (
    artifact.kind !== 'browser' ||
    artifact.profile.browserClient !== true ||
    artifact.profile.mode !== 'development' ||
    options.browser ||
    options.collectOnly ||
    options.coverage ||
    options.customCoverage ||
    options.setupFiles.length ||
    options.snapshotSerializers?.length ||
    options.globals ||
    options.fakeTimers ||
    options.clearMocks ||
    options.mockReset ||
    options.restoreMocks ||
    options.unstubGlobals ||
    options.unstubEnvs ||
    options.inspect ||
    options.retry ||
    options.bail ||
    options.sequence?.hooks ||
    options.sequence?.setupFiles ||
    options.sequence?.concurrent ||
    (typeof options.sequence?.shuffle === 'object'
      ? options.sequence.shuffle.tests
      : options.sequence?.shuffle) ||
    (options.provide && Object.keys(options.provide).length) ||
    (options.maxConcurrency && options.maxConcurrency !== 1) ||
    options.tags?.length ||
    options.strictTags ||
    options.attachmentsDir
  )
    throw new Error(
      'Browser Mode currently requires one isolated synchronous case without Node driver, setup, hooks, fixtures, coverage, globals, retries, concurrency, or runtime configuration.'
    )
  if (options.entry.file !== artifact.client.sourceFile)
    throw new Error(
      'Browser Mode selected source differs from the compiled source owner.'
    )
  if (!Number.isFinite(options.fileTimeout) || options.fileTimeout <= 0)
    throw new Error('Browser Mode requires a finite file deadline.')
  const snapshotUpdateMode = resolveSnapshotUpdateMode(options)
  if (options.testNamePattern !== undefined) new RegExp(options.testNamePattern)
  const started = performance.now(),
    controller = new AbortController(),
    errors: unknown[] = [],
    cleanupErrors: unknown[] = []
  const envelope = () => ({
    version: 1 as const,
    runId: options.runId,
    timestamp: Date.now(),
  })
  options.onEvent({
    ...envelope(),
    type: 'file-start',
    entry: options.entry,
    revision: artifact.revision,
  })
  const onAbort = () => controller.abort(options.signal.reason)
  options.signal.addEventListener('abort', onAbort, { once: true })
  if (options.signal.aborted) onAbort()
  const timer = setTimeout(
    () => controller.abort(new Error('Browser Mode file deadline exceeded.')),
    options.fileTimeout
  )
  let host: BrowserHost | undefined,
    browser: Browser | undefined,
    context: BrowserContext | undefined,
    page: Page | undefined,
    server: Awaited<ReturnType<typeof createClientServer>> | undefined
  let closing = false,
    cleanCompletion = false
  const collector = createClientResultCollector(
    artifact,
    { ...options, updateSnapshots: snapshotUpdateMode !== 'none' },
    (stack) => server?.mapStack(stack) ?? []
  )
  const fail = (error: unknown) => {
    errors.push(error)
    server?.fail(error)
  }
  const onPageError = (error: Error) => fail(error)
  const onCrash = () => fail(new Error('Browser Mode page crashed.'))
  const onClose = () => {
    if (!closing)
      fail(new Error('Browser Mode page closed before its owner completed.'))
  }
  let rejectAbort!: (error: unknown) => void
  const interrupted = new Promise<never>((_, reject) => {
    rejectAbort = reject
  })
  interrupted.catch(() => {})
  const abort = () => rejectAbort(controller.signal.reason)
  controller.signal.addEventListener('abort', abort, { once: true })
  if (controller.signal.aborted) abort()
  try {
    controller.signal.throwIfAborted()
    server = await createClientServer({
      artifact,
      configuration: {
        version: 1,
        runId: options.runId,
        entryId: artifact.entryId,
        revision: artifact.revision,
        ownerToken: randomBytes(32).toString('hex'),
        filePath: artifact.client.sourceFile,
        sourceHash: artifact.sourceHash,
        projectDir: options.projectDir,
        snapshotUpdateMode,
        testNamePattern:
          options.testNamePattern === undefined
            ? undefined
            : String(options.testNamePattern),
        allowOnly: options.allowOnly,
        testTimeout: options.testTimeout,
        hookTimeout: options.hookTimeout,
      },
      onMessage: collector.accept,
      onFailure: (error) => errors.push(error),
    })
    controller.signal.throwIfAborted()
    host = await createBrowserHost({
      projectDir: options.projectDir,
      signal: controller.signal,
    })
    controller.signal.throwIfAborted()
    browser = await connectBrowserHost({
      projectDir: options.projectDir,
      wsEndpoint: host.wsEndpoint,
      timeout: Math.min(30000, options.fileTimeout),
    })
    controller.signal.throwIfAborted()
    context = await browser.newContext({ serviceWorkers: 'block' })
    controller.signal.throwIfAborted()
    page = await context.newPage()
    page.on('pageerror', onPageError)
    page.on('crash', onCrash)
    page.on('close', onClose)
    await Promise.race([
      page.goto(server.url, {
        waitUntil: 'load',
        timeout: Math.min(30000, options.fileTimeout),
      }),
      interrupted,
    ])
    await Promise.race([server.completion, interrupted])
    cleanCompletion = true
  } catch (error) {
    errors.push(error)
  } finally {
    closing = true
    clearTimeout(timer)
    controller.signal.removeEventListener('abort', abort)
    options.signal.removeEventListener('abort', onAbort)
    // Every acquired owner is awaited, including when a prior disposal fails.
    for (const dispose of [
      () => context?.close(),
      () => browser?.close(),
      () => host?.dispose(),
      () => server?.dispose(),
    ]) {
      try {
        await dispose()
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
  }
  if (cleanupErrors.length)
    throw new AggregateError(
      [...errors, ...cleanupErrors],
      'Browser Mode owner cleanup could not be confirmed.'
    )
  if (cleanCompletion) {
    try {
      await server!.verify()
      server!.assertClean()
    } catch (error) {
      errors.push(error)
    }
  }
  const actualErrors = errors.filter(
    (error) => !options.signal.aborted || error !== options.signal.reason
  )
  for (const error of actualErrors) collector.fail(error)
  let facts: ReturnType<typeof collector.result> | undefined
  if (cleanCompletion) {
    try {
      facts = collector.result()
    } catch (error) {
      collector.fail(error)
      errors.push(error)
    }
  }
  for (const event of collector.events) options.onEvent(event)
  let status: TestExecutionResult['status'] =
    options.signal.aborted && !collector.hasFailure()
      ? 'cancelled'
      : (facts?.status ?? 'failed')
  if (actualErrors.length) status = 'failed'
  if (status === 'passed' && facts?.updates.length) {
    try {
      options.signal.throwIfAborted()
      await server!.verify()
      if (options.onSnapshotUpdates)
        await options.onSnapshotUpdates(
          artifact.client.sourceFile,
          facts.updates
        )
      else
        await commitSnapshotUpdates(artifact.client.sourceFile, facts.updates, {
          projectDir: options.projectDir,
          signal: options.signal,
          sourceHash: artifact.sourceHash,
        })
    } catch (error) {
      status = 'failed'
      options.onEvent({
        ...envelope(),
        type: 'diagnostic',
        entryId: artifact.entryId,
        revision: artifact.revision,
        diagnostic: serializeDiagnostic(error, { phase: 'cleanup' }),
      })
    }
  }
  const result = {
    entryId: artifact.entryId,
    status,
    durationMs: performance.now() - started,
  }
  options.onEvent({ ...envelope(), type: 'file-end', ...result })
  return result
}
