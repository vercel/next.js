import type {
  InstrumentationModule,
  InstrumentationOnRequestError,
} from '../server/instrumentation/types'

type Hook = keyof InstrumentationModule

type CombinedInstrumentation = {
  register(): Promise<void>
  onRequestError(
    ...args: Parameters<InstrumentationOnRequestError>
  ): Promise<void>
}

function getHook(mod: unknown, name: Hook) {
  const record = mod as Record<string, unknown> | undefined
  const hook =
    record?.[name] ??
    (record?.default as Record<string, unknown> | undefined)?.[name]
  return typeof hook === 'function' ? hook : undefined
}

/**
 * Combines the `injectInstrumentation` modules and the project's own
 * instrumentation file into one instrumentation module. Each hook runs every
 * module's export in array order. A module that throws does not stop the
 * others. Errors are rethrown after all have run.
 */
export function combineInstrumentation(
  modules: readonly unknown[]
): CombinedInstrumentation {
  async function callEach(name: Hook, args: unknown[]) {
    const errors: unknown[] = []
    for (const mod of modules) {
      try {
        // `require()` returns a promise for a module that uses top-level
        // await. A module that fails to load is collected like a hook error.
        const hook = getHook(await mod, name)
        if (hook) await hook(...args)
      } catch (err) {
        errors.push(err)
      }
    }
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

  return {
    register: () => callEach('register', []),
    onRequestError: (...args: Parameters<InstrumentationOnRequestError>) =>
      callEach('onRequestError', args),
  }
}
