import { pathToFileURL } from 'node:url'
import {
  createCustomReporterModules,
  type CustomReporterCompletion,
} from './custom-reporter-tasks'
import { serializeDiagnostic } from './diagnostics'

type Reporter = {
  onInit?(context: unknown): unknown
  onTestRunEnd?(modules: unknown[], errors: unknown[], reason: string): unknown
}
let reporters: Reporter[] = []
const closeCallbacks: (() => unknown)[] = []
let root: string
let initialized = false
let finished = false
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
      for (const file of message.input.files) {
        const loaded = await import(pathToFileURL(file).href)
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
              !['onInit', 'onTestRunEnd'].includes(name) &&
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
      await send({ type: 'custom-reporter-result' })
      return
    }
    if (message.type === 'finish' && initialized && !finished) {
      finished = true
      const completion: CustomReporterCompletion = message.completion
      const modules = createCustomReporterModules(root, completion)
      const errors = completion.events.flatMap((event) =>
        event.type === 'diagnostic' &&
        !event.entryId &&
        event.diagnostic.severity === 'error'
          ? [event.diagnostic]
          : []
      )
      await settle(
        reporters.map(
          (reporter) => () =>
            reporter.onTestRunEnd?.(
              modules,
              errors,
              completion.status === 'cancelled'
                ? 'interrupted'
                : completion.status
            )
        )
      )
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
process.on('message', (message) => {
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
