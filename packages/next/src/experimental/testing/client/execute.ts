import { cleanupClientKeyboard, runClientKeyboard } from './keyboard'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import type { Browser, BrowserContext, ConsoleMessage, Page } from 'playwright'
import type {
  CompiledBrowserClientTestArtifact,
  ExecuteTestOptions,
  TestExecutionResult,
} from '../contracts'
import { assertArtifactProfile } from '../execution/artifact-profile'
import { assertCompiledSetup } from '../execution/setup'
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
import { runClientBrowserAction } from './action-error'
import { clientLocatorEngine, registerClientLocators } from './locator-engine'

/** Execute a compiler-certified client graph in its freshly owned page. */
export async function executeClient(
  artifact: CompiledBrowserClientTestArtifact,
  options: ExecuteTestOptions
): Promise<TestExecutionResult> {
  assertArtifactProfile(artifact, options.entry)
  assertCompiledSetup(artifact, options.setupFiles)
  if (
    artifact.kind !== 'browser' ||
    artifact.client.asyncScope !== 'promise-continuations-v1' ||
    artifact.client.creatorScope !== 'synchronous-source-v1' ||
    artifact.client.creatorPromiseRoute !== 'native-engine-v1' ||
    artifact.profile.browserClient !== true ||
    (artifact.profile.mode !== 'development' &&
      artifact.profile.mode !== 'production') ||
    options.browser ||
    options.collectOnly ||
    (options.coverage &&
      (options.coverage.version !== 1 ||
        options.coverage.kind !== 'browser-v8' ||
        !options.onCoverage)) ||
    options.customCoverage ||
    (options.setupFiles.length && options.coverage) ||
    options.snapshotSerializers?.length ||
    options.inspect ||
    (options.retry !== undefined &&
      (typeof options.retry !== 'number' ||
        !Number.isSafeInteger(options.retry) ||
        options.retry < 0)) ||
    options.bail ||
    options.sequence?.hooks ||
    (options.sequence?.setupFiles && options.sequence.setupFiles !== 'list') ||
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
      'Browser Mode currently requires an isolated compiler-certified serial file without Node driver, parallel setup, setup coverage, fixtures, nonnumeric retries, concurrency, or runtime configuration.'
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
  const forwardedEvents = options.captureTaskResults
    ? new Set<ResultEvent>()
    : undefined
  const publishCapturedEvents = () => {
    if (!forwardedEvents) return
    for (const event of collector.events) {
      if (forwardedEvents.has(event)) continue
      // A rejecting observer must not receive the same actual event twice.
      forwardedEvents.add(event)
      options.onEvent(event)
    }
  }
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
        ...(options.entry.projectName === undefined
          ? {}
          : { projectName: options.entry.projectName }),
        sourceHash: artifact.sourceHash,
        projectDir: options.projectDir,
        snapshotUpdateMode,
        ...(options.captureTaskResults ? { captureTaskResults: true } : {}),
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
      async onBrowserCommand(command, admit = () => {}) {
        const deferredLocator =
          typeof command?.element === 'string' &&
          /^next-test-locator-[0-9]+$/.test(command.element)
        if (
          !page ||
          closing ||
          !command ||
          (!/^next-test-element-[0-9]+$/.test(command.element) &&
            !(
              deferredLocator &&
              (command.method === 'click' ||
                command.method === 'fill' ||
                command.method === 'dblClick' ||
                command.method === 'tripleClick' ||
                command.method === 'hover' ||
                command.method === 'unhover' ||
                command.method === 'selectOptions')
            )) ||
          !Array.isArray(command.args)
        )
          throw new Error('Invalid Browser Mode element command.')
        const runAction = <T>(perform: () => Promise<T>) => {
          admit()
          return runClientBrowserAction(perform)
        }
        const actionPage = page
        const locator = deferredLocator
          ? actionPage.locator(clientLocatorEngine + '=' + command.element)
          : actionPage.locator(`[data-next-test-element="${command.element}"]`)
        switch (command.method) {
          case 'dragAndDrop': {
            const [target, dragOptions] = command.args
            if (
              command.args.length < 1 ||
              command.args.length > 2 ||
              typeof target !== 'string' ||
              !/^next-test-element-[0-9]+$/.test(target) ||
              (dragOptions !== undefined &&
                (!dragOptions ||
                  typeof dragOptions !== 'object' ||
                  Array.isArray(dragOptions)))
            )
              throw new Error('Invalid Browser Mode drag target or options.')
            const frame = actionPage.mainFrame()
            await runAction(() =>
              frame.dragAndDrop(
                `[data-next-test-element="${command.element}"]`,
                `[data-next-test-element="${target}"]`,
                dragOptions as Parameters<typeof frame.dragAndDrop>[2]
              )
            )
            break
          }
          case 'click':
            await runAction(() =>
              locator.click(
                command.args[0] as Parameters<typeof locator.click>[0]
              )
            )
            break
          case 'dblClick':
            await runAction(() =>
              locator.dblclick(
                command.args[0] as Parameters<typeof locator.dblclick>[0]
              )
            )
            break
          case 'keyboardCleanup': {
            const state = command.args[0]
            if (
              !Array.isArray(state) ||
              state.some((key) => typeof key !== 'string')
            )
              throw new Error('Invalid keyboard state.')
            await runAction(async () => {
              await actionPage.evaluate(() => {})
              await cleanupClientKeyboard(actionPage.keyboard, state)
            })
            break
          }
          case 'type':
          case 'keyboard': {
            if (typeof command.args[0] !== 'string')
              throw new Error('Invalid keyboard text.')
            const text = command.args[0]
            const state = command.args[command.method === 'type' ? 2 : 1] ?? []
            if (
              !Array.isArray(state) ||
              state.some((key) => typeof key !== 'string')
            )
              throw new Error('Invalid keyboard state.')
            return runAction(async () => {
              // Settle the awaiting continuation's classifier pause before input.
              await actionPage.evaluate(() => {})
              let skipRelease = true
              if (command.method === 'type') {
                const typeOptions = command.args[1] as
                  | { skipClick?: boolean; skipAutoClose?: boolean }
                  | undefined
                if (
                  typeOptions !== undefined &&
                  (!typeOptions ||
                    typeof typeOptions !== 'object' ||
                    Array.isArray(typeOptions) ||
                    Object.keys(typeOptions).some(
                      (key) => key !== 'skipClick' && key !== 'skipAutoClose'
                    ) ||
                    (typeOptions.skipClick !== undefined &&
                      typeof typeOptions.skipClick !== 'boolean') ||
                    (typeOptions.skipAutoClose !== undefined &&
                      typeof typeOptions.skipAutoClose !== 'boolean'))
                )
                  throw new Error('Unsupported Browser type options.')
                if (!typeOptions?.skipClick) await locator.focus()
                skipRelease = typeOptions?.skipAutoClose ?? false
              }
              return runClientKeyboard(
                actionPage.keyboard,
                text,
                () =>
                  command.method === 'type'
                    ? locator.selectText()
                    : actionPage.evaluate(() => {
                        const active =
                          document.activeElement as HTMLInputElement | null
                        if (typeof active?.select === 'function')
                          active.select()
                      }),
                state,
                skipRelease
              )
            })
          }
          case 'wheel': {
            const wheelOptions = command.args[0] as
              | { delta: { x: number; y: number }; times: number }
              | undefined
            if (
              !wheelOptions ||
              !wheelOptions.delta ||
              !Number.isFinite(wheelOptions.delta.x) ||
              !Number.isFinite(wheelOptions.delta.y) ||
              !Number.isSafeInteger(wheelOptions.times) ||
              wheelOptions.times < 0
            )
              throw new Error('Invalid Browser wheel command.')
            await runAction(async () => {
              await locator.hover()
              for (let count = 0; count < wheelOptions.times; count++)
                await actionPage.mouse.wheel(
                  wheelOptions.delta.x,
                  wheelOptions.delta.y
                )
            })
            break
          }
          case 'tab': {
            // Direct keyboard input has no locator actionability round-trip.
            // Settle the client continuation's classifier pause before input.
            await page.evaluate(() => {})
            const tabOptions =
              command.args[0] === undefined
                ? {}
                : (command.args[0] as { shift?: boolean })
            await runAction(() =>
              actionPage.keyboard.press(
                tabOptions.shift === true ? 'Shift+Tab' : 'Tab'
              )
            )
            break
          }
          case 'tripleClick':
            await runAction(() =>
              locator.click({
                ...(command.args[0] as Parameters<typeof locator.click>[0]),
                clickCount: 3,
              })
            )
            break
          case 'unhover':
            await runAction(async () => {
              await actionPage.evaluate(() => {})
              await actionPage
                .locator('body')
                .hover(command.args[0] as Parameters<typeof locator.hover>[0])
            })
            break
          case 'hover':
            await runAction(async () => {
              await actionPage.evaluate(() => {})
              await locator.hover(
                command.args[0] as Parameters<typeof locator.hover>[0]
              )
            })
            break
          case 'fill':
            if (typeof command.args[0] !== 'string')
              throw new Error('Invalid fill text.')
            await runAction(() =>
              locator.fill(
                command.args[0] as string,
                command.args[1] as Parameters<typeof locator.fill>[1]
              )
            )
            break
          case 'clear':
            await runAction(() =>
              locator.clear(
                command.args[0] as Parameters<typeof locator.clear>[0]
              )
            )
            break
          case 'selectOptions': {
            const selections = command.args[0]
            if (
              !Array.isArray(selections) ||
              selections.some((value) =>
                typeof value === 'string'
                  ? false
                  : !value ||
                    typeof value !== 'object' ||
                    Array.isArray(value) ||
                    Object.keys(value).length !== 1 ||
                    typeof value.element !== 'string' ||
                    !/^next-test-element-[0-9]+$/.test(value.element)
              ) ||
              selections.some(
                (value) =>
                  (typeof value === 'string') !==
                  (typeof selections[0] === 'string')
              )
            )
              throw new Error('Invalid option selection.')
            await runAction(async () => {
              const handles: NonNullable<
                Awaited<ReturnType<typeof locator.elementHandle>>
              >[] = []
              try {
                for (const value of selections as (
                  | string
                  | { element: string }
                )[]) {
                  if (typeof value !== 'string') {
                    const handle = await actionPage
                      .locator(`[data-next-test-element="${value.element}"]`)
                      .elementHandle()
                    if (!handle)
                      throw new Error(
                        'Browser option element is not attached to its document.'
                      )
                    handles.push(handle)
                  }
                }
                await locator.selectOption(
                  handles.length ? handles : (selections as string[]),
                  command.args[1] as Parameters<typeof locator.selectOption>[1]
                )
              } finally {
                for (const handle of handles) {
                  try {
                    await handle.dispose()
                  } catch (error) {
                    cleanupErrors.push(error)
                  }
                }
              }
            })
            break
          }
          case 'upload': {
            if (!Array.isArray(command.args[0]))
              throw new Error('Invalid upload files.')
            const files = command.args[0].map((file: unknown) => {
              if (typeof file === 'string')
                return resolve(options.projectDir, file)
              if (
                !file ||
                typeof file !== 'object' ||
                typeof Reflect.get(file, 'name') !== 'string' ||
                typeof Reflect.get(file, 'mimeType') !== 'string' ||
                typeof Reflect.get(file, 'base64') !== 'string'
              )
                throw new Error('Invalid upload file payload.')
              return {
                name: Reflect.get(file, 'name') as string,
                mimeType: Reflect.get(file, 'mimeType') as string,
                buffer: Buffer.from(Reflect.get(file, 'base64'), 'base64'),
              }
            })
            await runAction(() =>
              locator.setInputFiles(
                files as Parameters<typeof locator.setInputFiles>[0],
                command.args[1] as Parameters<typeof locator.setInputFiles>[1]
              )
            )
            break
          }
          default:
            throw new Error('Unsupported Browser Mode element command.')
        }
        return null
      },
      onMessage(message) {
        if (message.type === 'output') {
          if (
            !['stdout', 'stderr'].includes(message.stream) ||
            typeof message.text !== 'string' ||
            (message.console !== undefined &&
              (!Number.isInteger(message.console.size) ||
                message.console.size < 0 ||
                (message.console.taskId !== undefined &&
                  typeof message.console.taskId !== 'string') ||
                message.console.browser !== true ||
                !Number.isFinite(message.time)))
          )
            throw new Error('Invalid Browser Mode console output.')
          options.onEvent({
            ...envelope(),
            type: 'output',
            entryId: artifact.entryId,
            revision: artifact.revision,
            stream: message.stream,
            text: message.text,
            ...(message.console
              ? {
                  console: message.console,
                  timestamp: message.time ?? envelope().timestamp,
                }
              : {}),
          })
        } else {
          const value = collector.accept(message)
          publishCapturedEvents()
          return value
        }
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
      beforeConnect: registerClientLocators,
    })
    controller.signal.throwIfAborted()
    const contextOptions = {
      serviceWorkers: 'block' as const,
      ...(options.browserViewport ? { viewport: options.browserViewport } : {}),
    }
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
  if (forwardedEvents) publishCapturedEvents()
  else for (const event of collector.events) options.onEvent(event)
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
