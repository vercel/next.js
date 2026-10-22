import { createLiveReporterTaskStore } from './custom-reporter-live-tasks'
import type { ReporterTaskSnapshot } from './live-tasks'
import { pathToFileURL } from 'node:url'
import { extname, isAbsolute, sep } from 'node:path'
import { register } from 'node:module'
import {
  createCustomReporterModules,
  type CustomReporterCompletion,
} from './custom-reporter-tasks'
import { serializeDiagnostic } from './diagnostics'

type Reporter = {
  onInit?(context: unknown): unknown
  onUserConsoleLog?(log: unknown): unknown
  onTestModuleEnd?(module: unknown): unknown
  onTestCaseResult?(test: unknown): unknown
  onTestRunEnd?(modules: unknown[], errors: unknown[], reason: string): unknown
}
let reporters: Reporter[] = []
const closeCallbacks: (() => unknown)[] = []
let live: ReturnType<typeof createLiveReporterTaskStore>
let root: string
let initialized = false
let finished = false
const consoleErrors: unknown[] = []
const completedModules = new Map<
  string,
  | ReturnType<typeof createCustomReporterModules>[number]
  | NonNullable<
      ReturnType<ReturnType<typeof createLiveReporterTaskStore>['get']>
    >
>()
let queue = Promise.resolve()
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
      root = message.input.projectDir
      live = createLiveReporterTaskStore(root)
      const context = contextMember(
        {
          config: contextMember({ root }, 'context.config'),
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
              ![
                'onInit',
                'onUserConsoleLog',
                'onTestModuleEnd',
                'onTestCaseResult',
                'onTestRunEnd',
              ].includes(name) &&
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
        captureTaskResults: reporters.some(
          (reporter) =>
            typeof reporter.onTestCaseResult === 'function' ||
            typeof reporter.onTestModuleEnd === 'function' ||
            typeof reporter.onTestRunEnd === 'function'
        ),
      })
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
      live.update(tree)
      const module = live.finishModule(tree.id, message.completion)
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
      const module = live.update(tree, undefined, message.relativeModuleId)
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
      if (!live.finishModule(message.entryId, message.completion))
        throw new Error(
          'Final module state requires its actual collected file.'
        )
      await send({ type: 'custom-reporter-result' })
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
        live.finishModule(message.entryId, completion) ??
        createCustomReporterModules(root, completion).find(
          (item) => item.id === message.entryId
        )
      if (!module)
        throw new Error(
          'Custom module reporters require the actual test entry.'
        )
      completedModules.set(message.entryId, module)
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
      const modules = createCustomReporterModules(root, completion).map(
        (module) => completedModules.get(module.id) ?? module
      )
      const errors = completion.events.flatMap((event) =>
        event.type === 'diagnostic' &&
        (!event.entryId || event.diagnostic.unhandled === 'rejection') &&
        event.diagnostic.severity === 'error'
          ? [event.diagnostic]
          : []
      )
      try {
        await finishCallbacks(
          modules,
          [...errors, ...(completion.recordedReporterErrors ?? [])],
          completion.status === 'cancelled' ? 'interrupted' : completion.status
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
    await send({
      type: 'custom-reporter-failed',
      error: serializeDiagnostic(error, { phase: 'reporter' }),
    })
    if (message.type === 'shutdown' || message.type === 'cancel')
      process.exit(1)
  }
}
process.on('message', (message: any) => {
  if (message?.type === 'task-state' && initialized && !finished) {
    try {
      live.update(message.taskTree, message.taskUpdateIds)
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
