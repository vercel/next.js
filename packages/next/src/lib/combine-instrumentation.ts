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
 * Combines the `injectInstrumentation` modules into one instrumentation
 * module. Each hook runs every module's export in array order. A module that
 * throws does not stop the others. Errors are rethrown after all have run.
 */
export function combineInstrumentation(
  modules: readonly unknown[]
): CombinedInstrumentation {
  async function callEach(name: Hook, args: unknown[]) {
    const errors: unknown[] = []
    for (const mod of modules) {
      const hook = getHook(mod, name)
      if (!hook) continue
      try {
        await hook(...args)
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
        `${errors.length} injected instrumentation modules failed in ${name}()`
      )
    }
  }

  return {
    register: () => callEach('register', []),
    onRequestError: (...args: Parameters<InstrumentationOnRequestError>) =>
      callEach('onRequestError', args),
  }
}
