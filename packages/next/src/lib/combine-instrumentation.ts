import type {
  InstrumentationModule,
  InstrumentationOnRequestError,
} from '../server/instrumentation/types'
import { interopDefault } from './interop-default'

type Hook = keyof InstrumentationModule

type CombinedInstrumentation = {
  register(): Promise<void>
  onRequestError(
    ...args: Parameters<InstrumentationOnRequestError>
  ): Promise<void>
}

/**
 * Combines the `instrumentationInject` modules and the project's own
 * instrumentation file into one instrumentation module. `register` runs every
 * module's export in array order. `onRequestError` runs them concurrently, so
 * one handler can't hold up another. A hook that throws, or a module with
 * top-level await that fails to load, does not stop the others. Errors are
 * rethrown after all have run.
 */
export function combineInstrumentation(
  modules: readonly unknown[]
): CombinedInstrumentation {
  // Every module is required before any hook runs, so an async module can
  // reject while an earlier hook is still awaiting. Mark those promises as
  // handled now. `callEach` still awaits them and collects the error.
  for (const mod of modules) {
    if (typeof (mod as PromiseLike<unknown> | undefined)?.then === 'function') {
      ;(mod as PromiseLike<unknown>).then(undefined, () => {})
    }
  }

  async function callHook(mod: unknown, name: Hook, args: unknown[]) {
    // `require()` returns a promise for a module that uses top-level await. If
    // one of those fails to load, its error is collected like a hook error. A
    // module without top-level await that throws while loading stops startup
    // before this runs.
    const instrumentation = interopDefault((await mod) ?? {}) as Record<
      string,
      unknown
    >
    const hook = instrumentation[name]
    if (typeof hook === 'function') await hook.apply(instrumentation, args)
  }

  function throwCollected(name: Hook, errors: unknown[]) {
    if (errors.length === 1) {
      throw errors[0]
    }
    if (errors.length > 1) {
      throw new AggregateError(
        errors,
        `${errors.length} instrumentation modules failed in ${name}()`
      )
    }
  }

  // `register` runs in array order, so a later module can rely on an earlier
  // one having set up.
  async function registerInOrder() {
    const errors: unknown[] = []
    for (const mod of modules) {
      try {
        await callHook(mod, 'register', [])
      } catch (err) {
        errors.push(err)
      }
    }
    throwCollected('register', errors)
  }

  // `onRequestError` handlers are independent, so they run together: a slow or
  // hanging injected handler can't stop the project's own handler from running.
  async function reportToAll(args: unknown[]) {
    const results = await Promise.allSettled(
      modules.map((mod) => callHook(mod, 'onRequestError', args))
    )
    throwCollected(
      'onRequestError',
      results
        .filter((result) => result.status === 'rejected')
        .map((result) => (result as PromiseRejectedResult).reason)
    )
  }

  return {
    register: registerInOrder,
    onRequestError: (...args: Parameters<InstrumentationOnRequestError>) =>
      reportToAll(args),
  }
}
