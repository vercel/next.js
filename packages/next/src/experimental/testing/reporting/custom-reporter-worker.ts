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
import { pathToFileURL } from 'node:url'
import { extname, isAbsolute, sep } from 'node:path'
import { register } from 'node:module'
import {
  createCustomReporterModules,
  hasOnlySnapshotPreparationRunFailures,
  type CustomReporterCompletion,
} from './custom-reporter-tasks'
import { serializeDiagnostic } from './diagnostics'

type Reporter = {
  onInit?(context: unknown): unknown
  onWatcherRerun?(files: string[], trigger?: string): unknown
  onWatcherStart?(files?: unknown[]): unknown
  onTestRemoved?(file: string): unknown
  onUserConsoleLog?(log: unknown): unknown
  onTestModuleQueued?(module: unknown): unknown
  onTestModuleCollected?(module: unknown): unknown
  onTestModuleStart?(module: unknown): unknown
  onTestModuleEnd?(module: unknown): unknown
  onTestCaseResult?(test: unknown): unknown
  onTestRunEnd?(modules: unknown[], errors: unknown[], reason: string): unknown
}
let reporters: Reporter[] = []
const closeCallbacks: (() => unknown)[] = []
let live: ReturnType<typeof createLiveReporterTaskStore>
let root: string
let queuedProjectRoot: string
let initialized = false
let finished = false
let watching = false
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
const send = (value: object) =>
  new Promise<void>((resolve, reject) =>
    process.send!(value, (error: Error | null) =>
      error ? reject(error) : resolve()
    )
  )
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
  const errors = view.type === 'test' ? view.result?.().errors : view.errors?.()
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
  for (const child of view.children?.array() ?? []) prepareReportedModule(child)
  return module
}
function prepareReportedModules<T>(modules: T[]): T[] {
  for (const module of modules) prepareReportedModule(module)
  return modules
}

async function settle(callbacks: (() => unknown)[]) {
  const results = await Promise.allSettled(
    callbacks.map(async (callback) => callback())
  )
  const errors = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : []
  )
  if (errors.length === 1) throw errors[0]
  if (errors.length)
    throw new AggregateError(errors, 'Custom reporter callbacks failed.')
}
async function shutdown() {
  await Promise.all([
    ...queuedCallbacks,
    ...collectedCallbacks,
    ...startedCallbacks,
  ])
  await settle(closeCallbacks.splice(0))
}
async function replayCases(tree: ReporterTaskSnapshot) {
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
  reason: string
) {
  await Promise.all([
    ...queuedCallbacks,
    ...collectedCallbacks,
    ...startedCallbacks,
  ])
  let completionError: unknown
  await settle(
    reporters.map(
      (reporter) => () =>
        reporter.onTestRunEnd?.(modules, [...errors, ...consoleErrors], reason)
    )
  ).catch((error) => {
    completionError = error
  })
  if (completionError) consoleErrors.push(completionError)
  if (consoleErrors.length === 1) throw consoleErrors[0]
  if (consoleErrors.length)
    throw new AggregateError(
      consoleErrors,
      'Custom reporter console callbacks failed.'
    )
}
async function handle(message: any) {
  try {
    if (message.type === 'shutdown' || message.type === 'cancel') {
      await shutdown()
      if (message.type === 'shutdown')
        await send({ type: 'custom-reporter-result' })
      process.exit(message.type === 'shutdown' ? 0 : 1)
      return
    }
    if (message.type === 'run' && !initialized) {
      initialized = true
      watching = message.input.watch === true
      root = message.input.projectDir
      queuedProjectRoot = message.input.queuedProjectRoot
      live = createLiveReporterTaskStore(root)
      const context = contextMember(
        {
          config: contextMember(
            { root, ...(watching ? { watch: true } : {}) },
            'context.config'
          ),
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
          pathToFileURL(__filename).href,
          {
            parentURL: pathToFileURL(__filename).href,
            data: {
              entries: typedEntries,
              packages: packageEntries,
              issuer: pathToFileURL(__filename).href,
              projectURL: pathToFileURL(root.endsWith(sep) ? root : root + sep)
                .href,
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
                  'onTestModuleQueued',
                  'onTestModuleCollected',
                  'onTestModuleStart',
                ].includes(name) && !watching
              ) &&
              ![
                'onInit',
                'onUserConsoleLog',
                'onTestModuleEnd',
                'onTestCaseResult',
                'onTestRunEnd',
              ].includes(name) &&
              !(
                watching &&
                ['onWatcherRerun', 'onWatcherStart', 'onTestRemoved'].includes(
                  name
                )
              ) &&
              typeof Reflect.get(reporter, name) === 'function'
            )
              throw new Error(
                `Custom reporter ${name} requires actual Next producer events and is not implemented by the completion adapter.`
              )
        reporters.push(reporter)
      }
      await settle(
        reporters.map((reporter) => () => reporter.onInit?.(context))
      )
      await send({
        type: 'custom-reporter-result',
        captureModuleStart: reporters.some(
          (reporter) => typeof reporter.onTestModuleStart === 'function'
        ),
        captureModuleCollected: reporters.some(
          (reporter) =>
            typeof reporter.onTestModuleCollected === 'function' ||
            typeof reporter.onTestModuleStart === 'function'
        ),
        captureModuleQueued: reporters.some(
          (reporter) => typeof reporter.onTestModuleQueued === 'function'
        ),
        captureTaskResults: reporters.some(
          (reporter) =>
            typeof reporter.onTestModuleCollected === 'function' ||
            typeof reporter.onTestModuleStart === 'function' ||
            typeof reporter.onTestCaseResult === 'function' ||
            typeof reporter.onTestModuleEnd === 'function' ||
            typeof reporter.onTestRunEnd === 'function' ||
            (watching && typeof reporter.onWatcherStart === 'function')
        ),
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
    if (message.type === 'watch-ready' && initialized && watching && finished) {
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
    if (message.type === 'case-result' && initialized && !finished) {
      const test = live.case(message.entryId, message.caseId)
      try {
        await settle(
          reporters.map((reporter) => () => reporter.onTestCaseResult?.(test))
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
      await replayCases(tree)
      await settle(
        reporters.map((reporter) => () => reporter.onTestModuleEnd?.(module))
      ).catch((error) => consoleErrors.push(error))
      await send({ type: 'custom-reporter-result' })
      return
    }
    if (message.type === 'imported-file' && initialized && !finished) {
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
          createCustomReporterModules(root, completion)
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
          reporters.map((reporter) => () => reporter.onTestModuleEnd?.(module))
        )
      } catch (error) {
        consoleErrors.push(error)
      }
      await send({ type: 'custom-reporter-result' })
      return
    }
    if (message.type === 'finish' && initialized && !finished) {
      finished = true
      const completion: CustomReporterCompletion = message.completion
      if (watching) watchEntryIds = completion.files.map((file) => file.entryId)
      const modules = prepareReportedModules(
        createCustomReporterModules(root, completion)
      ).map((module) =>
        preparedEntryIds.has(module.id)
          ? (live.get(module.id) ?? module)
          : (completedModules.get(module.id) ?? module)
      )
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
          ? [preparationErrors.get(index) ?? reportedRunError(event.diagnostic)]
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
              : completion.status
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
    const fatalWatchError =
      watching &&
      ['watch-begin', 'watch-ready', 'watch-removed'].includes(message.type)
    await send({
      type: 'custom-reporter-failed',
      ...(fatalWatchError ? { fatalWatchError: true } : {}),
      error: serializeDiagnostic(error, { phase: 'reporter' }),
    })
    if (
      message.type === 'shutdown' ||
      message.type === 'cancel' ||
      (watching &&
        ['watch-begin', 'watch-ready', 'watch-removed'].includes(message.type))
    )
      process.exit(1)
  }
}
process.on('message', (message: any) => {
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
        !reporters.some((reporter) => reporter.onTestModuleQueued)
      )
        throw new Error('Invalid selected module queue occurrence.')
      queuedEntryIds.add(entry.id)
      const module = createQueuedReporterModule(queuedProjectRoot, entry)
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
  if (message?.type === 'task-state' && initialized && !finished) {
    try {
      const module = prepareReportedModule(
        live.update(message.taskTree, message.taskUpdateIds)
      )
      if (message.notifyCollected === true) {
        if (
          watching ||
          collectedEntryIds.has(message.taskTree.id) ||
          !reporters.some(
            (reporter) =>
              reporter.onTestModuleCollected || reporter.onTestModuleStart
          )
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
      process.exit(1)
    })
})
process.once('disconnect', () => {
  void shutdown().then(
    () => process.exit(1),
    () => process.exit(1)
  )
})
process.on('unhandledRejection', (error) => {
  void send({
    type: 'custom-reporter-failed',
    error: serializeDiagnostic(error, { phase: 'reporter' }),
  }).then(
    () => process.exit(1),
    () => process.exit(1)
  )
})
