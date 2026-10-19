import { randomBytes } from 'node:crypto'
import type { Browser, BrowserContext, ConsoleMessage, Page } from 'playwright'
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
import type { ResultEvent } from '../reporting/events'
import { createClientServer } from './server'
import { createClientResultCollector } from './results'
import { createClientCoverage } from './coverage'
import { createClientEngineBrand } from './engine-brand'
import { clientConsoleBoundary } from './protocol'

/** Execute a compiler-certified client graph in its freshly owned page. */
export async function executeClient(
  artifact: CompiledBrowserClientTestArtifact,
  options: ExecuteTestOptions
): Promise<TestExecutionResult> {
  assertArtifactProfile(artifact, options.entry)
  if (
    artifact.kind !== 'browser' ||
    artifact.client.asyncScope !== 'promise-continuations-v1' ||
    artifact.client.creatorScope !== 'synchronous-source-v1' ||
    artifact.client.creatorPromiseRoute !== 'native-engine-v1' ||
    artifact.profile.browserClient !== true ||
    artifact.profile.mode !== 'development' ||
    options.browser ||
    options.collectOnly ||
    (options.coverage &&
      (options.coverage.version !== 1 ||
        options.coverage.kind !== 'browser-v8' ||
        !options.onCoverage)) ||
    options.customCoverage ||
    options.setupFiles.length ||
    options.snapshotSerializers?.length ||
    options.inspect ||
    (options.retry !== undefined &&
      (typeof options.retry !== 'number' ||
        !Number.isSafeInteger(options.retry) ||
        options.retry < 0)) ||
    options.bail ||
    options.sequence?.hooks ||
    options.sequence?.setupFiles ||
    options.sequence?.concurrent ||
    (typeof options.sequence?.shuffle === 'object'
      ? options.sequence.shuffle.tests
      : options.sequence?.shuffle) ||
    (options.maxConcurrency && options.maxConcurrency !== 1) ||
    options.tags?.length ||
    options.strictTags ||
    options.attachmentsDir
  )
    throw new Error(
      'Browser Mode currently requires an isolated compiler-certified serial file without Node driver, setup, fixtures, nonnumeric retries, concurrency, or runtime configuration.'
    )
  if (options.entry.file !== artifact.client.sourceFile)
    throw new Error(
      'Browser Mode selected source differs from the compiled source owner.'
    )
  if (!Number.isFinite(options.fileTimeout) || options.fileTimeout <= 0)
    throw new Error('Browser Mode requires a finite file deadline.')
  // Vitest Browser projects provided values through JSON before file loading.
  const provide: Record<string, unknown> = JSON.parse(
    JSON.stringify(options.provide ?? {})
  )
  const snapshotUpdateMode = resolveSnapshotUpdateMode(options)
  const testNamePattern =
    options.testNamePattern === undefined
      ? undefined
      : new RegExp(options.testNamePattern)
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
    server: Awaited<ReturnType<typeof createClientServer>> | undefined,
    coverage: ReturnType<typeof createClientCoverage> | undefined,
    engineBrand: ReturnType<typeof createClientEngineBrand> | undefined
  let closing = false,
    cleanCompletion = false,
    managedConsole = false,
    escapedConsoleDebug = false,
    consoleCompleted = false
  const collector = createClientResultCollector(
    artifact,
    { ...options, updateSnapshots: snapshotUpdateMode !== 'none' },
    (stack) => server?.mapStack(stack) ?? []
  )
  const fail = (error: unknown) => {
    errors.push(error)
    server?.fail(error)
  }
  const deferredConsole: ResultEvent[] = []
  const onConsole = (message: ConsoleMessage) => {
    try {
      const text = message.text()
      if (message.type() === 'debug' && escapedConsoleDebug) {
        escapedConsoleDebug = false
        return
      }
      if (
        managedConsole &&
        message.type() === 'debug' &&
        text === clientConsoleBoundary.escape
      ) {
        escapedConsoleDebug = true
        return
      }
      if (
        !consoleCompleted &&
        message.type() === 'debug' &&
        text === clientConsoleBoundary.start
      ) {
        managedConsole = true
        return
      }
      if (
        managedConsole &&
        message.type() === 'debug' &&
        text === clientConsoleBoundary.stop
      ) {
        managedConsole = false
        consoleCompleted = true
        return
      }
      if (
        managedConsole &&
        ['log', 'info', 'debug', 'warning', 'error'].includes(message.type())
      )
        return
      const event: ResultEvent = {
        ...envelope(),
        type: 'output',
        entryId: artifact.entryId,
        revision: artifact.revision,
        stream: ['error', 'warning', 'trace', 'assert'].includes(message.type())
          ? 'stderr'
          : 'stdout',
        text: `${text}\n`,
      }
      if (consoleCompleted) deferredConsole.push(event)
      else options.onEvent(event)
    } catch (error) {
      fail(error)
    }
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
          testNamePattern === undefined
            ? undefined
            : { source: testNamePattern.source, flags: testNamePattern.flags },
        allowOnly: options.allowOnly,
        testTimeout: options.testTimeout,
        hookTimeout: options.hookTimeout,
        fakeTimers: options.fakeTimers,
        provide,
        env: options.env,
        globals: options.globals,
        clearMocks: options.clearMocks,
        mockReset: options.mockReset,
        restoreMocks: options.restoreMocks,
        unstubGlobals: options.unstubGlobals,
        unstubEnvs: options.unstubEnvs,
        retry: typeof options.retry === 'number' ? options.retry : undefined,
      },
      async onBrowserCommand(command) {
        if (
          !page ||
          closing ||
          !command ||
          !/^next-test-element-[0-9]+$/.test(command.element) ||
          !Array.isArray(command.args)
        )
          throw new Error('Invalid Browser Mode element command.')
        const locator = page.locator(
          `[data-next-test-element="${command.element}"]`
        )
        switch (command.method) {
          case 'click':
            await locator.click()
            break
          case 'dblClick':
            await locator.dblclick()
            break
          case 'hover':
            await locator.hover()
            break
          case 'fill':
            if (typeof command.args[0] !== 'string')
              throw new Error('Invalid fill text.')
            await locator.fill(command.args[0])
            break
          case 'clear':
            await locator.clear()
            break
          case 'selectOptions':
            if (
              !Array.isArray(command.args[0]) ||
              !command.args[0].every((v) => typeof v === 'string')
            )
              throw new Error('Invalid option selection.')
            await locator.selectOption(command.args[0])
            break
          default:
            throw new Error('Unsupported Browser Mode element command.')
        }
        return null
      },
      onMessage(message) {
        if (message.type === 'output') {
          if (
            !['stdout', 'stderr'].includes(message.stream) ||
            typeof message.text !== 'string'
          )
            throw new Error('Invalid Browser Mode console output.')
          options.onEvent({
            ...envelope(),
            type: 'output',
            entryId: artifact.entryId,
            revision: artifact.revision,
            stream: message.stream,
            text: message.text,
          })
        } else return collector.accept(message)
      },
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
    const contextOptions = { serviceWorkers: 'block' as const }
    context = await browser.newContext(contextOptions)
    controller.signal.throwIfAborted()
    page = await context.newPage()
    page.on('console', onConsole)
    page.on('pageerror', onPageError)
    page.on('crash', onCrash)
    page.on('close', onClose)
    engineBrand = createClientEngineBrand({
      context,
      page,
      url: server.url,
      signal: controller.signal,
      onFailure: fail,
    })
    await Promise.race([engineBrand.start(), interrupted])
    if (options.coverage) {
      coverage = createClientCoverage({
        artifact,
        browser,
        context,
        page,
        url: server.url,
        contextOptions,
        engineBrandFact: () => engineBrand!.fact(),
        signal: controller.signal,
        onFailure: fail,
      })
      await Promise.race([coverage.start(), interrupted])
    }
    await Promise.race([
      page.goto(server.url, {
        waitUntil: 'load',
        timeout: Math.min(30000, options.fileTimeout),
      }),
      interrupted,
    ])
    await Promise.race([server.completion, interrupted])
    if (coverage) await Promise.race([coverage.take(), interrupted])
    engineBrand.fact()
    cleanCompletion = true
  } catch (error) {
    errors.push(error)
  } finally {
    closing = true
    engineBrand?.close()
    coverage?.close()
    clearTimeout(timer)
    controller.signal.removeEventListener('abort', abort)
    options.signal.removeEventListener('abort', onAbort)
    // Every acquired owner is awaited, including when a prior disposal fails.
    for (const dispose of [
      () => context?.close(),
      () => page?.off('console', onConsole),
      () => browser?.close(),
      () => host?.dispose(),
      () => engineBrand?.afterOwnersClosed(),
      () => coverage?.afterOwnersClosed(),
      () => server?.dispose(),
      () => {
        // Native calls after STOP can overtake older queued RPC output. Publish
        // them after both channels close, retaining each captured event unchanged.
        for (const event of deferredConsole.splice(0)) {
          try {
            options.onEvent(event)
          } catch (error) {
            fail(error)
          }
        }
      },
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
  if (
    coverage &&
    cleanCompletion &&
    !actualErrors.length &&
    !options.signal.aborted
  ) {
    try {
      const data = await coverage.result()
      await server!.verify()
      server!.assertClean()
      await options.onCoverage!({
        version: 1,
        runId: options.runId,
        entryId: artifact.entryId,
        revision: artifact.revision,
        complete: true,
        data,
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
