import type { TestRecordEvent } from '../contracts'
import type { ReporterCaseEvent } from './task-updates'
import {
  invokeTestRecordReporters,
  type ReporterTestRecordOutcome,
} from './test-records'
import { Console } from 'node:console'
import type { CustomReporterFinalExit } from './custom-reporter-exit'
import type {
  CustomReporterCompletionFailure,
  CustomReporterCompletionPrefix,
} from './custom-reporter'
import {
  isRunErrorDiagnostic,
  reportedRunError,
  hasOnlyBrowserCleanupRunFailures,
} from './run-errors'
import { createCustomReporterWatchFile } from './custom-reporter-watch-tasks'
import {
  createLiveReporterTaskStore,
  createQueuedReporterModule,
} from './custom-reporter-live-tasks'
import type { ReporterTaskSnapshot } from './live-tasks'
import { createReporterRunSpecifications } from './custom-reporter-specifications'
import { pathToFileURL } from 'node:url'
import { extname, isAbsolute, sep } from 'node:path'
import { register } from 'node:module'
import {
  createCustomReporterModules,
  hasOnlySnapshotPreparationRunFailures,
  type CustomReporterCompletion,
} from './custom-reporter-tasks'
import { serializeDiagnostic } from './diagnostics'
import { types as nodeTypes } from 'node:util'

type Reporter = {
  onInit?(context: unknown): unknown
  onTestRunStart?(specifications: unknown[]): unknown
  onProcessTimeout?(): unknown
  onWatcherRerun?(files: string[], trigger?: string): unknown
  onWatcherStart?(files?: unknown[]): unknown
  onTestRemoved?(file: string): unknown
  onUserConsoleLog?(log: unknown): unknown
  onTestModuleQueued?(module: unknown): unknown
  onTestModuleCollected?(module: unknown): unknown
  onTestModuleStart?(module: unknown): unknown
  onTestModuleEnd?(module: unknown): unknown
  onTestCaseReady?(test: unknown): unknown
  onTestCaseResult?(test: unknown): unknown
  onTestCaseAnnotate?: unknown
  onTestCaseArtifactRecord?: unknown
  onTestRunEnd?(modules: unknown[], errors: unknown[], reason: string): unknown
}
const applyReporterCallback = Reflect.apply
/** A reporter session can share the evaluated root configuration realm. */
export interface CustomReporterRuntimeOptions {
  send(value: object): Promise<void>
  /** The caller owns physical process lifetime. */
  closeTransport(code: number): void | Promise<void>
}

export function createCustomReporterRuntime(
  options: CustomReporterRuntimeOptions
) {
  const reporterWorkerFilename = require.resolve('./custom-reporter-worker')
  let reporters: Reporter[] = []
  const closeCallbacks: (() => unknown)[] = []
  const retainedFinishCallbacks: Promise<PromiseSettledResult<unknown>[]>[] = []
  let live: ReturnType<typeof createLiveReporterTaskStore>
  let root: string
  let queuedProjectRoot: string
  let initialized = false
  let initializationCallbacksStarted = false
  let finished = false
  let watching = false
  let captureTestRecords = false
  const recordIds = new Set<number>()
  const recordCallbacks = new Set<Promise<void>>()
  let runSpecifications:
    | ReturnType<typeof createReporterRunSpecifications>
    | undefined
  let finalExit: CustomReporterFinalExit | undefined
  let closeConsole: Console | undefined
  const watchTrees = new Map<string, ReporterTaskSnapshot>()
  let watchEntryIds: string[] = []
  const consoleErrors: unknown[] = []
  const completedModules = new Map<
    string,
    | ReturnType<typeof createCustomReporterModules>[number]
    | NonNullable<
        ReturnType<ReturnType<typeof createLiveReporterTaskStore>['get']>
      >
  >()
  let queue = Promise.resolve()
  const queuedCallbacks: Promise<void>[] = []
  const collectedCallbacks: Promise<void>[] = []
  const startedCallbacks: Promise<void>[] = []
  const collectedStartOwners = new Map<
    string,
    { runId: string; revision: string }
  >()
  const moduleStarts = new Map<
    string,
    { failed: boolean; completion: Promise<boolean> }
  >()
  const collectedEntryIds = new Set<string>()
  const failedCollectedEntryIds = new Set<string>()
  const preparedEntryIds = new Set<string>()
  const queuedEntryIds = new Set<string>()
  const readyCaseIds = new Set<string>()
  const completedCaseIds = new Set<string>()
  const send = options.send
  let transportClosed = false
  let transportClose: Promise<void> | undefined
  function closeTransport(code: number): Promise<void> {
    if (transportClosed) return transportClose!
    let resolveClose!: (value: void | PromiseLike<void>) => void
    let rejectClose!: (error: unknown) => void
    transportClose = new Promise<void>((resolve, reject) => {
      resolveClose = resolve
      rejectClose = reject
    })
    transportClosed = true
    try {
      resolveClose(options.closeTransport(code))
    } catch (error) {
      rejectClose(error)
    }
    return transportClose
  }
  function contextMember<T extends object>(value: T, label: string): T {
    return new Proxy(value, {
      get(target, key, receiver) {
        if (Reflect.has(target, key)) return Reflect.get(target, key, receiver)
        if (typeof key === 'symbol' || key === 'then' || key === 'toJSON')
          return undefined
        throw new Error(
          `Custom reporter ${label}.${String(key)} needs a broader Next tooling adapter and is not implemented.`
        )
      },
    })
  }
  // Reporters receive their own IPC copies; execution Task errors stay untouched.
  const preparedReportedErrors = new WeakSet<object>()
  function prepareReportedModule<T>(module: T): T {
    const view = module as
      | {
          type: string
          result?(): { errors?: unknown[] }
          errors?(): unknown[]
          children?: { array(): unknown[] }
        }
      | undefined
    if (!view) return module
    const errors =
      view.type === 'test' ? view.result?.().errors : view.errors?.()
    for (const error of errors ?? []) {
      if (
        !error ||
        typeof error !== 'object' ||
        preparedReportedErrors.has(error)
      )
        continue
      preparedReportedErrors.add(error)
      if ('stacks' in error && error.stacks) continue
      const stack = (error as { stack?: unknown }).stack
      if (typeof stack !== 'string' || stack.length === 0)
        Object.defineProperty(error, 'stacks', {
          value: [],
          enumerable: true,
          writable: true,
          configurable: true,
        })
    }
    for (const child of view.children?.array() ?? [])
      prepareReportedModule(child)
    return module
  }
  function prepareReportedModules<T>(modules: T[]): T[] {
    for (const module of modules) prepareReportedModule(module)
    return modules
  }

  function invokeCaseReady(reporter: Reporter, test: unknown): unknown {
    // Capture authored accessors once even under the normal loose transform.
    const callback = reporter.onTestCaseReady
    if (callback !== undefined && callback !== null)
      return applyReporterCallback(callback, reporter, [test])
  }
  function hasPotentialCaseReady(reporter: Reporter): boolean {
    let current: object | null = reporter
    while (current !== null) {
      if (nodeTypes.isProxy(current)) return true
      const descriptor = Reflect.getOwnPropertyDescriptor(
        current,
        'onTestCaseReady'
      )
      if (descriptor)
        return 'value' in descriptor
          ? descriptor.value !== undefined && descriptor.value !== null
          : typeof descriptor.get === 'function'
      current = Reflect.getPrototypeOf(current)
    }
    return false
  }
  function hasPotentialRunHook(
    reporter: Reporter,
    name: 'onTestRunStart' | 'onTestModuleStart'
  ): boolean {
    let current: object | null = reporter
    while (current !== null) {
      // Descriptor inspection must not invoke an authored callback getter.
      if (nodeTypes.isProxy(current)) return true
      const descriptor = Reflect.getOwnPropertyDescriptor(current, name)
      if (descriptor)
        return 'value' in descriptor
          ? descriptor.value !== undefined && descriptor.value !== null
          : typeof descriptor.get === 'function'
      current = Reflect.getPrototypeOf(current)
    }
    return false
  }
  function hasPotentialRecordCallback(
    reporter: Reporter,
    name: 'onTestCaseAnnotate' | 'onTestCaseArtifactRecord'
  ): boolean {
    let current: object | null = reporter
    while (current !== null) {
      // Descriptor inspection must not invoke an authored callback getter.
      if (nodeTypes.isProxy(current)) return true
      const descriptor = Reflect.getOwnPropertyDescriptor(current, name)
      if (descriptor)
        return 'value' in descriptor
          ? descriptor.value !== undefined && descriptor.value !== null
          : typeof descriptor.get === 'function'
      current = Reflect.getPrototypeOf(current)
    }
    return false
  }
  function hasPotentialCompletionHook(reporter: Reporter): boolean {
    let current: object | null = reporter
    while (current !== null) {
      // Preserve the existing Proxy read path without adding observable traps.
      if (nodeTypes.isProxy(current))
        return typeof reporter.onTestRunEnd === 'function'
      const descriptor = Reflect.getOwnPropertyDescriptor(
        current,
        'onTestRunEnd'
      )
      if (descriptor)
        return 'value' in descriptor
          ? descriptor.value !== undefined && descriptor.value !== null
          : typeof descriptor.get === 'function'
      current = Reflect.getPrototypeOf(current)
    }
    return false
  }
  // The selected one-shot Node boundary proves these domains have no occurrence.
  // Known declarations remain unread until their actual domain is selected.
  const selectedDomainNames = [
    'onBrowserInit',
    'onTestRemoved',
    'onWatcherStart',
    'onWatcherRerun',
    'onServerRestart',
    'onCoverage',
    'onTestCaseBenchmark',
  ] as const
  function hasPotentialSelectedDomain(
    reporter: Reporter,
    name?: (typeof selectedDomainNames)[number]
  ): boolean {
    return (name ? [name] : selectedDomainNames).some((key) => {
      let current: object | null = reporter
      while (current !== null) {
        if (nodeTypes.isProxy(current)) return true
        const descriptor = Reflect.getOwnPropertyDescriptor(current, key)
        if (descriptor)
          return 'value' in descriptor
            ? descriptor.value !== undefined && descriptor.value !== null
            : typeof descriptor.get === 'function'
        current = Reflect.getPrototypeOf(current)
      }
      return false
    })
  }
  function needsSelectedBoundary(reporter: Reporter): boolean {
    return (
      hasPotentialRunHook(reporter, 'onTestRunStart') ||
      hasPotentialSelectedDomain(reporter)
    )
  }
  async function settle(
    callbacks: (() => unknown)[],
    invoked?: () => Promise<void>
  ) {
    const completion = Promise.allSettled(
      callbacks.map(async (callback) => callback())
    )
    if (invoked) await invoked()
    const results = await completion
    const errors = results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : []
    )
    if (errors.length === 1) throw errors[0]
    if (errors.length)
      throw new AggregateError(errors, 'Custom reporter callbacks failed.')
  }
  let shutdownPromise: Promise<void> | undefined
  let synchronousCloseFailure: { error: unknown } | undefined
  let asynchronousCloseFailed = false
  let ordinaryCloseFailure: 'sync' | 'async' | undefined
  let initialCloseErrorLogged = false
  async function shutdownOnce(ordinary: boolean) {
    if (recordCallbacks.size) await Promise.allSettled([...recordCallbacks])
    await Promise.all([
      ...queuedCallbacks,
      ...collectedCallbacks,
      ...startedCallbacks,
    ])
    const closeErrors: unknown[] = []
    if (finalExit) {
      const returned: unknown[] = []
      try {
        // A synchronous invocation throw stops the initial close map. Returned
        // Promises retain the separate allSettled path used by the real owner.
        for (const callback of closeCallbacks.splice(0))
          returned.push(callback())
      } catch (error) {
        synchronousCloseFailure = { error }
        // The force owner joins this realm. The aborted map must not inspect
        // or adopt earlier returned thenables while delivering this failure.
        throw error
      }
      const results = await Promise.allSettled(returned)
      for (const result of results)
        if (result.status === 'rejected') closeErrors.push(result.reason)
      asynchronousCloseFailed = closeErrors.length > 0
    } else {
      try {
        await settle(closeCallbacks.splice(0))
      } catch (error) {
        closeErrors.push(error)
      }
    }
    const retained = await Promise.all(retainedFinishCallbacks.splice(0))
    for (const results of retained)
      for (const result of results)
        if (result.status === 'rejected') closeErrors.push(result.reason)
    if (asynchronousCloseFailed) {
      if (ordinary) {
        // Keep the actual rejected values in their owning realm. The native
        // logger observes authored inspection hooks before failure selects 1.
        for (const error of closeErrors)
          closeConsole!.error('error during close', error)
        initialCloseErrorLogged = true
      }
      process.exitCode = 1
    }
    if (closeErrors.length === 1) throw closeErrors[0]
    if (closeErrors.length)
      throw new AggregateError(
        closeErrors,
        'Custom reporter close and retained completions failed.'
      )
  }
  function shutdown(ordinary = false) {
    return (shutdownPromise ??= shutdownOnce(ordinary))
  }
  function assertRecordReplayOwner() {
    if (captureTestRecords)
      throw new Error(
        'Test record reporter replay requires actual record RPC ownership and is not implemented.'
      )
  }
  async function replayCases(
    tree: ReporterTaskSnapshot,
    occurrences?: ReporterCaseEvent[]
  ) {
    if (occurrences !== undefined) {
      for (const occurrence of occurrences) {
        const test = live.case(tree.id, occurrence.caseId)
        try {
          if (occurrence.event === 'ready')
            await Promise.all(
              reporters.map((reporter) => invokeCaseReady(reporter, test))
            )
          else
            await settle(
              reporters.map(
                (reporter) => () => reporter.onTestCaseResult?.(test)
              )
            )
        } catch (error) {
          consoleErrors.push(error)
        }
      }
      return
    }
    async function visit(suite: ReporterTaskSnapshot): Promise<void> {
      for (const task of suite.tasks ?? []) {
        if (task.type === 'suite') await visit(task)
        else if (suite.mode !== 'skip' && suite.mode !== 'todo') {
          const test = live.case(tree.id, task.id)
          await settle(
            reporters.map((reporter) => () => reporter.onTestCaseResult?.(test))
          ).catch((error) => consoleErrors.push(error))
        }
      }
    }
    await visit(tree)
  }
  async function finishCallbacks(
    modules: unknown[],
    errors: unknown[],
    reason: string,
    onPrefix?: (receipt: CustomReporterCompletionPrefix) => Promise<void>
  ) {
    await Promise.all([
      ...queuedCallbacks,
      ...collectedCallbacks,
      ...startedCallbacks,
    ])
    let completionError: unknown
    let invokedCount = 0
    let synchronousThrow: { reporterIndex: number } | undefined
    let completionFailure: CustomReporterCompletionFailure | undefined
    let synchronousFailure: { error: unknown } | undefined
    let accessFailure: { error: unknown } | undefined
    const returned: Promise<unknown>[] = []
    await settle(
      reporters.map((reporter, reporterIndex) => () => {
        if (
          onPrefix &&
          (synchronousThrow !== undefined || completionFailure !== undefined)
        )
          return
        if (!onPrefix)
          return reporter.onTestRunEnd?.(
            modules,
            [...errors, ...consoleErrors],
            reason
          )
        let callback: Reporter['onTestRunEnd']
        try {
          callback = reporter.onTestRunEnd
        } catch (error) {
          completionFailure = { reporterIndex, kind: 'access' }
          accessFailure = { error }
          throw error
        }
        if (callback === undefined || callback === null) return
        if (typeof callback !== 'function') {
          completionFailure = { reporterIndex, kind: 'noncallable' }
          const error = new TypeError(
            'Custom reporter onTestRunEnd is not a function.'
          )
          accessFailure = { error }
          throw error
        }
        invokedCount++
        let value: unknown
        try {
          value = Reflect.apply(callback, reporter, [
            modules,
            [...errors, ...consoleErrors],
            reason,
          ])
        } catch (error) {
          synchronousThrow ??= { reporterIndex }
          synchronousFailure ??= { error }
          throw error
        }
        const owned = Promise.resolve(value)
        void owned.catch(() => {})
        returned.push(owned)
        return owned
      }),
      onPrefix
        ? async () => {
            // Every actual callback's synchronous prefix has returned or thrown.
            // A reporter without this hook produces no invocation receipt.
            if (synchronousFailure || accessFailure)
              retainedFinishCallbacks.push(Promise.allSettled(returned))
            if (completionFailure)
              await onPrefix({
                completionFailure,
                ...(invokedCount
                  ? { invocation: { count: invokedCount } }
                  : {}),
              })
            else if (invokedCount)
              await onPrefix({
                count: invokedCount,
                ...(synchronousThrow ? { synchronousThrow } : {}),
              })
            if (synchronousFailure) throw synchronousFailure.error
            if (accessFailure) throw accessFailure.error
          }
        : undefined
    ).catch((error) => {
      completionError = error
    })
    if (completionError || synchronousFailure || completionFailure)
      consoleErrors.push(completionError)
    if (consoleErrors.length === 1) throw consoleErrors[0]
    if (consoleErrors.length)
      throw new AggregateError(
        consoleErrors,
        'Custom reporter console callbacks failed.'
      )
  }
  async function handle(message: any) {
    if (transportClosed) return
    try {
      if (message.type === 'shutdown' || message.type === 'cancel') {
        if (message.type === 'shutdown' && message.exitCodeSnapshot)
          process.exitCode = message.exitCodeSnapshot.value
        await shutdown(message.type === 'shutdown')
        if (message.type === 'shutdown')
          await send({ type: 'custom-reporter-result' })
        await closeTransport(message.type === 'shutdown' ? 0 : 1)
        return
      }
      if (message.type === 'run' && !initialized) {
        initialized = true
        watching = message.input.watch === true
        const reporterConfig = {
          root: message.input.projectDir,
          teardownTimeout: message.input.teardownTimeout ?? 10000,
          ...(watching ? { watch: true } : {}),
        }
        if (!watching && message.input.finalExitLifecycle === true) {
          closeConsole = new Console({
            stdout: process.stdout,
            stderr: process.stderr,
          })
          finalExit = {
            get teardownTimeout() {
              return reporterConfig.teardownTimeout
            },
            async reportProcessTimeout() {
              await Promise.all(
                reporters.map((reporter) => {
                  const callback = reporter.onProcessTimeout
                  if (callback !== undefined && callback !== null)
                    return applyReporterCallback(callback, reporter, [])
                  return undefined
                })
              )
            },
          }
        }
        root = message.input.projectDir
        queuedProjectRoot = message.input.queuedProjectRoot
        live = createLiveReporterTaskStore(root)
        const context = contextMember(
          {
            config: contextMember(reporterConfig, 'context.config'),
            onClose(callback: () => unknown) {
              if (typeof callback !== 'function')
                throw new TypeError('Reporter onClose requires a function.')
              closeCallbacks.push(callback)
            },
          },
          'context'
        )
        const typedEntries = (message.input.files as string[]).filter(
          (file) =>
            isAbsolute(file) &&
            ['.ts', '.mts', '.jsx', '.tsx'].includes(extname(file))
        )
        const packageEntries = message.input.files.filter(
          (file: string) => !isAbsolute(file)
        )
        if (typedEntries.length || packageEntries.length) {
          const loader = pathToFileURL(
            require.resolve('./custom-reporter-loader')
          ).href
          const shim = `import hooks from ${JSON.stringify(loader)};export const initialize=hooks.initialize,resolve=hooks.resolve,load=hooks.load;`
          register(
            `data:text/javascript,${encodeURIComponent(shim)}`,
            pathToFileURL(reporterWorkerFilename).href,
            {
              parentURL: pathToFileURL(reporterWorkerFilename).href,
              data: {
                entries: typedEntries,
                packages: packageEntries,
                issuer: pathToFileURL(reporterWorkerFilename).href,
                projectURL: pathToFileURL(
                  root.endsWith(sep) ? root : root + sep
                ).href,
              },
            }
          )
        }
        for (const file of message.input.files) {
          const loaded = await import(
            isAbsolute(file) ? pathToFileURL(file).href : file
          )
          if (typeof loaded.default !== 'function')
            throw new TypeError(
              `Custom reporter ${file} must export a default constructor.`
            )
          const reporter: Reporter = new loaded.default({})
          for (
            let proto = reporter;
            proto && proto !== Object.prototype;
            proto = Object.getPrototypeOf(proto)
          )
            for (const name of Object.getOwnPropertyNames(proto))
              if (
                /^on[A-Z]/.test(name) &&
                !(
                  [
                    'onTestRunStart',
                    'onTestModuleQueued',
                    'onTestModuleCollected',
                    'onTestModuleStart',
                    'onTestCaseReady',
                    'onTestCaseAnnotate',
                    'onTestCaseArtifactRecord',
                  ].includes(name) && !watching
                ) &&
                !(
                  selectedDomainNames.includes(
                    name as (typeof selectedDomainNames)[number]
                  ) && !watching
                ) &&
                !(name === 'onProcessTimeout' && finalExit) &&
                ![
                  'onInit',
                  'onUserConsoleLog',
                  'onTestModuleEnd',
                  'onTestCaseResult',
                  'onTestRunEnd',
                ].includes(name) &&
                !(
                  watching &&
                  [
                    'onWatcherRerun',
                    'onWatcherStart',
                    'onTestRemoved',
                  ].includes(name)
                ) &&
                typeof Reflect.get(reporter, name) === 'function'
              )
                throw new Error(
                  `Custom reporter ${name} requires actual Next producer events and is not implemented by the completion adapter.`
                )
          reporters.push(reporter)
        }
        initializationCallbacksStarted = true
        await settle(
          reporters.map((reporter) => () => reporter.onInit?.(context))
        )
        captureTestRecords = reporters.some(
          (reporter) =>
            hasPotentialRecordCallback(reporter, 'onTestCaseAnnotate') ||
            hasPotentialRecordCallback(reporter, 'onTestCaseArtifactRecord')
        )
        await send({
          type: 'custom-reporter-result',
          captureTestRecords,
          captureRunStart: !watching && reporters.some(needsSelectedBoundary),
          ...(reporters.some(hasPotentialCaseReady)
            ? { captureCaseReady: true }
            : {}),
          captureModuleStart: reporters.some(
            (reporter) => typeof reporter.onTestModuleStart === 'function'
          ),
          captureModuleCollected:
            (!watching && reporters.some(needsSelectedBoundary)) ||
            reporters.some(
              (reporter) =>
                typeof reporter.onTestModuleCollected === 'function' ||
                typeof reporter.onTestModuleStart === 'function'
            ),
          captureModuleQueued:
            (!watching && reporters.some(needsSelectedBoundary)) ||
            reporters.some(
              (reporter) => typeof reporter.onTestModuleQueued === 'function'
            ),
          captureTaskResults:
            reporters.some(hasPotentialCaseReady) ||
            captureTestRecords ||
            (!watching && reporters.some(needsSelectedBoundary)) ||
            reporters.some(
              (reporter) =>
                typeof reporter.onTestModuleCollected === 'function' ||
                typeof reporter.onTestModuleStart === 'function' ||
                typeof reporter.onTestCaseResult === 'function' ||
                typeof reporter.onTestModuleEnd === 'function' ||
                hasPotentialCompletionHook(reporter) ||
                (watching && typeof reporter.onWatcherStart === 'function')
            ),
        })
        return
      }
      if (message.type === 'run-start' && initialized && !finished) {
        if (watching || runSpecifications || queuedEntryIds.size)
          throw new Error(
            'Run Start requires its actual first selected boundary.'
          )
        if (!Array.isArray(message.specifications))
          throw new Error('Run Start requires actual selected specifications.')
        runSpecifications = createReporterRunSpecifications(
          message.specifications,
          (id) => completedModules.get(id) ?? live.getSelectedModule(id)
        )
        if (message.coverage !== undefined && message.coverage !== true)
          throw new Error(
            'Run Start requires an actual coverage selection fact.'
          )
        if (
          message.coverage === true &&
          reporters.some((reporter) =>
            hasPotentialSelectedDomain(reporter, 'onCoverage')
          )
        )
          throw new Error(
            'Custom reporter onCoverage requires its actual coverage publication adapter and is not implemented.'
          )
        // The list is a callback copy. Each selected specification remains shared.
        const specifications = [...runSpecifications.specifications]
        await Promise.all(
          reporters.map((reporter) => {
            const callback = reporter.onTestRunStart
            if (callback !== undefined && callback !== null)
              return applyReporterCallback(callback, reporter, [specifications])
            return undefined
          })
        )
        runSpecifications.assertUnchangedSelection()
        await send({
          type: 'custom-reporter-result',
          captureModuleStart: reporters.some((reporter) =>
            hasPotentialRunHook(reporter, 'onTestModuleStart')
          ),
          // Retained specifications keep following the actual queued/current File.
          captureModuleCollected: true,
          captureModuleQueued: true,
          captureTaskResults: true,
        })
        return
      }
      if (message.type === 'watch-begin' && initialized && watching) {
        // The parent joins the previous generation's execution owners before
        // retiring these task views. Reporter instances and close callbacks live
        // until the enclosing watch owner disposes this process.
        live = createLiveReporterTaskStore(root)
        completedModules.clear()
        watchTrees.clear()
        watchEntryIds = []
        consoleErrors.length = 0
        finished = false
        if (message.rerun) {
          if (
            !Array.isArray(message.rerun.files) ||
            message.rerun.files.some(
              (file: unknown) => typeof file !== 'string'
            ) ||
            (message.rerun.trigger !== undefined &&
              typeof message.rerun.trigger !== 'string')
          )
            throw new Error('Reporter rerun requires actual selected paths.')
          await settle(
            reporters.map(
              (reporter) => () =>
                reporter.onWatcherRerun?.(
                  message.rerun.files,
                  message.rerun.trigger
                )
            )
          )
        }
        await send({ type: 'custom-reporter-result' })
        return
      }
      if (
        message.type === 'watch-ready' &&
        initialized &&
        watching &&
        finished
      ) {
        const files =
          message.initial === true ||
          !reporters.some((reporter) => reporter.onWatcherStart)
            ? undefined
            : watchEntryIds.map((id) => {
                const tree = watchTrees.get(id)
                if (!tree)
                  throw new Error(
                    'Custom watch readiness requires an actual collected file; collection-failure task graphs remain unimplemented.'
                  )
                return createCustomReporterWatchFile(tree)
              })
        try {
          await settle(
            reporters.map(
              (reporter) => () =>
                message.initial === true
                  ? reporter.onWatcherStart?.()
                  : reporter.onWatcherStart?.(files)
            )
          )
        } catch (error) {
          if (message.initial !== true) throw error
          await send({
            type: 'custom-reporter-result',
            watchHookError: serializeDiagnostic(error, { phase: 'reporter' }),
          })
          return
        }
        await send({ type: 'custom-reporter-result' })
        return
      }
      if (
        message.type === 'watch-removed' &&
        initialized &&
        watching &&
        finished
      ) {
        if (
          !Array.isArray(message.files) ||
          message.files.some((file: unknown) => typeof file !== 'string')
        )
          throw new Error('Reporter removal requires actual removed paths.')
        for (const file of message.files)
          await settle(
            reporters.map((reporter) => () => reporter.onTestRemoved?.(file))
          )
        await send({ type: 'custom-reporter-result' })
        return
      }
      if (message.type === 'console' && initialized && !finished) {
        try {
          await settle(
            reporters.map(
              (reporter) => () => reporter.onUserConsoleLog?.(message.log)
            )
          )
        } catch (error) {
          consoleErrors.push(error)
        }
        await send({
          type: 'custom-reporter-result',
          ...(consoleErrors.length
            ? {
                reporterErrors: consoleErrors.map((error) =>
                  serializeDiagnostic(error, { phase: 'reporter' })
                ),
              }
            : {}),
        })
        return
      }
      if (
        (message.type === 'case-ready' || message.type === 'case-result') &&
        initialized &&
        !finished
      ) {
        try {
          const test = live.case(message.entryId, message.caseId)
          const identity = JSON.stringify([message.entryId, message.caseId])
          if (message.type === 'case-ready') {
            if (
              watching ||
              readyCaseIds.has(identity) ||
              completedCaseIds.has(identity)
            )
              throw new Error('Case Ready requires one actual prepared task.')
            readyCaseIds.add(identity)
          } else completedCaseIds.add(identity)
          if (message.type === 'case-ready')
            await Promise.all(
              reporters.map((reporter) => invokeCaseReady(reporter, test))
            )
          else
            await settle(
              reporters.map(
                (reporter) => () => reporter.onTestCaseResult?.(test)
              )
            )
        } catch (error) {
          consoleErrors.push(error)
        }
        await send({
          type: 'custom-reporter-result',
          ...(consoleErrors.length
            ? {
                reporterErrors: consoleErrors.map((error) =>
                  serializeDiagnostic(error, { phase: 'reporter' })
                ),
              }
            : {}),
        })
        return
      }
      if (message.type === 'reporter-errors' && initialized) {
        await send({
          type: 'custom-reporter-result',
          reporterErrors: consoleErrors.map((error) =>
            serializeDiagnostic(error, { phase: 'reporter' })
          ),
        })
        return
      }
      if (message.type === 'replay-file' && initialized && !finished) {
        assertRecordReplayOwner()
        const tree: ReporterTaskSnapshot = message.taskTree
        if (completedModules.has(tree.id))
          throw new Error('Reporter replay requires one terminal file.')
        prepareReportedModule(live.update(tree))
        if (watching) watchTrees.set(tree.id, tree)
        const module = prepareReportedModule(
          live.finishModule(tree.id, message.completion)
        )
        if (!module)
          throw new Error('Reporter replay requires the actual terminal file.')
        completedModules.set(tree.id, module)
        await replayCases(tree, message.caseEvents)
        await settle(
          reporters.map((reporter) => () => reporter.onTestModuleEnd?.(module))
        ).catch((error) => consoleErrors.push(error))
        await send({ type: 'custom-reporter-result' })
        return
      }
      if (message.type === 'imported-file' && initialized && !finished) {
        assertRecordReplayOwner()
        const tree: ReporterTaskSnapshot = message.taskTree
        if (
          completedModules.has(tree.id) ||
          typeof message.relativeModuleId !== 'string'
        )
          throw new Error('Imported reporter replay requires one native file.')
        const module = prepareReportedModule(
          live.update(tree, undefined, message.relativeModuleId)
        )
        completedModules.set(tree.id, module)
        await replayCases(tree)
        await settle(
          reporters.map((reporter) => () => reporter.onTestModuleEnd?.(module))
        ).catch((error) => consoleErrors.push(error))
        await send({ type: 'custom-reporter-result' })
        return
      }
      if (message.type === 'imported-finish' && initialized && !finished) {
        finished = true
        const ids: string[] = message.moduleIds
        if (
          !Array.isArray(ids) ||
          new Set(ids).size !== ids.length ||
          !Array.isArray(message.errors) ||
          !['passed', 'failed'].includes(message.status)
        )
          throw new Error('Imported reporter completion requires native facts.')
        const modules = ids.map((id) => {
          const module = completedModules.get(id)
          if (!module)
            throw new Error('Imported reporter completion is missing its file.')
          return module
        })
        await finishCallbacks(modules, message.errors, message.status)
        await send({ type: 'custom-reporter-result' })
        return
      }
      if (message.type === 'module-state' && initialized && !finished) {
        if (!completedModules.has(message.entryId))
          throw new Error(
            'Final module state requires its actual reporter callback.'
          )
        if (
          !prepareReportedModule(
            live.finishModule(
              message.entryId,
              message.completion,
              failedCollectedEntryIds.has(message.entryId)
            )
          )
        )
          throw new Error(
            'Final module state requires its actual collected file.'
          )
        await send({ type: 'custom-reporter-result' })
        return
      }
      if (
        message.type === 'snapshot-preparation-failure' &&
        initialized &&
        !finished
      ) {
        if (
          watching ||
          typeof message.entryId !== 'string' ||
          preparedEntryIds.has(message.entryId) ||
          completedModules.has(message.entryId) ||
          !live.get(message.entryId)
        )
          throw new Error(
            'Snapshot preparation requires one actual received reporter File.'
          )
        preparedEntryIds.add(message.entryId)
        return
      }
      if (message.type === 'module-end' && initialized && !finished) {
        if (
          !reporters.some((reporter) => reporter.onTestModuleEnd) &&
          !live.get(message.entryId)
        ) {
          await send({ type: 'custom-reporter-result' })
          return
        }
        const completion: CustomReporterCompletion = message.completion
        if (
          completedModules.has(message.entryId) ||
          !completion.files.some((file) => file.entryId === message.entryId)
        )
          throw new Error('Custom module reporters require one completed file.')
        const module =
          prepareReportedModule(
            live.finishModule(
              message.entryId,
              completion,
              failedCollectedEntryIds.has(message.entryId)
            )
          ) ??
          prepareReportedModules(
            createCustomReporterModules(
              root,
              completion,
              runSpecifications?.projectForEntry
            )
          ).find((item) => item.id === message.entryId)
        if (!module)
          throw new Error(
            'Custom module reporters require the actual test entry.'
          )
        completedModules.set(message.entryId, module)
        const start = moduleStarts.get(message.entryId)
        if (reporters.some((reporter) => reporter.onTestModuleStart) && !start)
          throw new Error('Module End lacks its actual prepared Module Start.')
        if (start?.failed && !(await start.completion)) {
          await send({ type: 'custom-reporter-result' })
          return
        }
        try {
          await settle(
            reporters.map(
              (reporter) => () => reporter.onTestModuleEnd?.(module)
            )
          )
        } catch (error) {
          consoleErrors.push(error)
        }
        await send({ type: 'custom-reporter-result' })
        return
      }
      if (
        (message.type === 'finish' || message.type === 'finish-begin') &&
        initialized &&
        !finished
      ) {
        finished = true
        if (finalExit && message.exitCodeSnapshot)
          process.exitCode = message.exitCodeSnapshot.value
        const completion: CustomReporterCompletion = message.completion
        if (watching)
          watchEntryIds = completion.files.map((file) => file.entryId)
        const modules = prepareReportedModules(
          createCustomReporterModules(
            root,
            completion,
            runSpecifications?.projectForEntry
          )
        ).map((module) =>
          preparedEntryIds.has(module.id)
            ? (live.get(module.id) ?? module)
            : (completedModules.get(module.id) ?? module)
        )
        if (runSpecifications)
          for (const module of modules) completedModules.set(module.id, module)
        const preparationErrors = new Map(
          (completion.snapshotPreparationFailures ?? []).flatMap((record) =>
            record.diagnosticEventIndex !== undefined &&
            record.failure.outcome.kind === 'error'
              ? [
                  [
                    record.diagnosticEventIndex,
                    record.failure.outcome.reportedError,
                  ] as const,
                ]
              : []
          )
        )
        const errors = completion.events.flatMap((event, index) =>
          event.type === 'diagnostic' &&
          (!event.entryId || isRunErrorDiagnostic(event.diagnostic)) &&
          event.diagnostic.severity === 'error'
            ? [
                preparationErrors.get(index) ??
                  reportedRunError(event.diagnostic),
              ]
            : []
        )
        try {
          await finishCallbacks(
            modules,
            [...errors, ...(completion.recordedReporterErrors ?? [])],
            completion.status === 'cancelled'
              ? 'interrupted'
              : hasOnlyBrowserCleanupRunFailures(completion) ||
                  hasOnlySnapshotPreparationRunFailures(completion)
                ? 'passed'
                : completion.status,
            message.type === 'finish-begin'
              ? async (receipt) =>
                  send({
                    type:
                      'completionFailure' in receipt
                        ? 'custom-reporter-completion-failure'
                        : 'custom-reporter-invoked',
                    ...receipt,
                  })
              : undefined
          )
        } catch (error) {
          await send({
            type: 'custom-reporter-failed',
            error: serializeDiagnostic(error, { phase: 'reporter' }),
            ...(consoleErrors.length
              ? {
                  reporterErrors: consoleErrors.map((reporterError) =>
                    serializeDiagnostic(reporterError, { phase: 'reporter' })
                  ),
                }
              : {}),
          })
          return
        }
        await send({ type: 'custom-reporter-result' })
        return
      }
      throw new Error('Invalid custom reporter request.')
    } catch (error) {
      if (message.type === 'run' && finalExit) {
        // Construction fails before the controller's onInit failure path.
        // Retain an authored status there; onInit failure selects one before close.
        if (initializationCallbacksStarted) process.exitCode = 1
        else process.exitCode ??= 1
      }
      if (message.type === 'shutdown') {
        if (synchronousCloseFailure) ordinaryCloseFailure = 'sync'
        else if (asynchronousCloseFailed) ordinaryCloseFailure = 'async'
      }
      const fatalWatchError =
        watching &&
        ['watch-begin', 'watch-ready', 'watch-removed'].includes(message.type)
      await send({
        type: 'custom-reporter-failed',
        ...(fatalWatchError ? { fatalWatchError: true } : {}),
        ...(ordinaryCloseFailure === 'sync'
          ? { initialCloseSyncFailed: true }
          : {}),
        ...(ordinaryCloseFailure === 'async'
          ? { initialCloseAsyncFailed: true }
          : {}),
        ...(ordinaryCloseFailure === 'async' && initialCloseErrorLogged
          ? { initialCloseErrorLogged: true }
          : {}),
        error: serializeDiagnostic(error, { phase: 'reporter' }),
      })
      if (
        message.type === 'shutdown' ||
        message.type === 'cancel' ||
        (watching &&
          ['watch-begin', 'watch-ready', 'watch-removed'].includes(
            message.type
          ))
      )
        closeTransport(1)
    }
  }
  function receive(message: any) {
    if (transportClosed) return
    if (message?.type === 'test-record') {
      const preceding = queue
      const operation = preceding.then(async () => {
        const event = message.event as TestRecordEvent
        let outcome: ReporterTestRecordOutcome
        try {
          if (
            !initialized ||
            finished ||
            watching ||
            !captureTestRecords ||
            !Number.isSafeInteger(message.recordId) ||
            message.recordId < 1 ||
            recordIds.has(message.recordId) ||
            !event ||
            !['test-annotation', 'test-artifact'].includes(event.type) ||
            typeof event.runId !== 'string' ||
            typeof event.entryId !== 'string' ||
            typeof event.revision !== 'string' ||
            typeof event.caseId !== 'string' ||
            typeof event.attempt?.id !== 'string' ||
            !Number.isSafeInteger(event.attempt.retry) ||
            event.attempt.retry < 0 ||
            !Number.isSafeInteger(event.attempt.repeat) ||
            event.attempt.repeat < 0
          )
            throw new Error(
              'Reporter test record requires its actual one-shot Test owner.'
            )
          recordIds.add(message.recordId)
          const test = live.record(event)
          outcome = await invokeTestRecordReporters(reporters, test, event)
        } catch (error) {
          outcome = { kind: 'throw', error }
        }
        await send({
          type: 'custom-reporter-record-result',
          recordId: message.recordId,
          runId: event?.runId,
          entryId: event?.entryId,
          revision: event?.revision,
          outcome,
        })
      })
      recordCallbacks.add(operation)
      void operation.then(
        () => recordCallbacks.delete(operation),
        (error) => {
          recordCallbacks.delete(operation)
          console.error(error)
          void closeTransport(1)
        }
      )
      return
    }
    if (message?.type === 'module-queued' && initialized && !finished) {
      try {
        const entry = message.entry
        if (
          watching ||
          !entry ||
          typeof entry.id !== 'string' ||
          typeof entry.file !== 'string' ||
          !isAbsolute(entry.file) ||
          (entry.projectName !== undefined &&
            typeof entry.projectName !== 'string') ||
          queuedEntryIds.has(entry.id) ||
          (!runSpecifications &&
            !reporters.some((reporter) => reporter.onTestModuleQueued))
        )
          throw new Error('Invalid selected module queue occurrence.')
        if (runSpecifications && !runSpecifications.matchesEntry(entry))
          throw new Error('Queued module is outside its selected Run Start.')
        queuedEntryIds.add(entry.id)
        const module = runSpecifications
          ? live.queue(entry, runSpecifications.projectForEntry(entry.id))
          : createQueuedReporterModule(queuedProjectRoot, entry)
        queuedCallbacks.push(
          settle(
            reporters.map(
              (reporter) => () => reporter.onTestModuleQueued?.(module)
            )
          ).catch((error) => {
            consoleErrors.push(error)
          })
        )
      } catch (error) {
        consoleErrors.push(error)
      }
      return
    }
    if (message?.type === 'task-packs' && initialized && !finished) {
      try {
        live.updatePacks(message.entryId, message.taskPacks)
      } catch (error) {
        consoleErrors.push(error)
      }
      return
    }
    if (message?.type === 'task-state' && initialized && !finished) {
      try {
        const module = prepareReportedModule(
          live.update(message.taskTree, message.taskUpdateIds)
        )
        if (message.notifyCollected === true) {
          if (
            watching ||
            collectedEntryIds.has(message.taskTree.id) ||
            (!runSpecifications &&
              !reporters.some(
                (reporter) =>
                  reporter.onTestModuleCollected || reporter.onTestModuleStart
              ))
          )
            throw new Error('Invalid actual module collection occurrence.')
          if (reporters.some((reporter) => reporter.onTestModuleStart)) {
            if (
              typeof message.runId !== 'string' ||
              typeof message.revision !== 'string' ||
              message.entryId !== message.taskTree.id
            )
              throw new Error('Module Start lacks its actual collected owner.')
            collectedStartOwners.set(message.entryId, {
              runId: message.runId,
              revision: message.revision,
            })
          }
          collectedEntryIds.add(message.taskTree.id)
          if (message.taskTree.result?.state === 'fail')
            failedCollectedEntryIds.add(message.taskTree.id)
          collectedCallbacks.push(
            settle(
              reporters.map(
                (reporter) => () => reporter.onTestModuleCollected?.(module)
              )
            ).catch((error) => {
              consoleErrors.push(error)
            })
          )
        }
        if (
          message.notifyCollected !== true &&
          reporters.some((reporter) => reporter.onTestModuleStart) &&
          !moduleStarts.has(message.entryId)
        ) {
          const owner = collectedStartOwners.get(message.entryId)
          if (
            watching ||
            !owner ||
            owner.runId !== message.runId ||
            owner.revision !== message.revision ||
            message.entryId !== message.taskTree.id ||
            preparedEntryIds.has(message.entryId) ||
            completedModules.has(message.entryId) ||
            !Array.isArray(message.taskUpdateIds) ||
            message.taskUpdateIds.length !== 1 ||
            message.taskUpdateIds[0] !== message.entryId ||
            !['run', 'fail', 'skip', 'todo'].includes(
              message.taskTree.result?.state
            )
          )
            throw new Error(
              'Module Start requires its actual first prepared root pack.'
            )
          // Preserve the received preparation state before authored callbacks.
          const preparedFailed = message.taskTree.result.state === 'fail'
          const completion = settle(
            reporters.map(
              (reporter) => () => reporter.onTestModuleStart?.(module)
            )
          ).then(
            () => true,
            (error) => {
              consoleErrors.push(error)
              return false
            }
          )
          moduleStarts.set(message.entryId, {
            failed: preparedFailed,
            completion,
          })
          startedCallbacks.push(completion.then(() => {}))
        }
        if (watching) watchTrees.set(message.taskTree.id, message.taskTree)
      } catch (error) {
        consoleErrors.push(error)
      }
      return
    }
    queue = queue
      .then(() => handle(message))
      .catch((error) => {
        console.error(error)
        return closeTransport(1)
      })
  }
  function disconnect() {
    return shutdown().then(
      () => closeTransport(1),
      () => closeTransport(1)
    )
  }
  function unhandledRejection(error: unknown) {
    void send({
      type: 'custom-reporter-failed',
      error: serializeDiagnostic(error, { phase: 'reporter' }),
    }).then(
      () => closeTransport(1),
      () => closeTransport(1)
    )
  }
  return {
    receive,
    disconnect,
    unhandledRejection,
    finalExit: () => finalExit,
    initialCloseFailure: () => ordinaryCloseFailure,
  }
}
