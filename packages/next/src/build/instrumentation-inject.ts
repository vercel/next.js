import path from 'path'
import type { NextConfigComplete } from '../server/config-shared'
import { INSTRUMENTATION_HOOK_FILENAME } from '../lib/constants'
import { NEXT_PROJECT_ROOT } from './next-dir-paths'

/**
 * The webpack entry for the instrumentation slot when `injectInstrumentation`
 * is set. `next-instrumentation-inject-loader` replaces its contents with a
 * module that runs every entry's hooks, then the project's own
 * `instrumentation` file.
 */
export const INSTRUMENTATION_INJECT_STUB_PATH = path.join(
  NEXT_PROJECT_ROOT,
  'dist/build/webpack/loaders/instrumentation-inject-stub.js'
)

/**
 * The modules from `injectInstrumentation`, chained ahead of the project's own
 * `instrumentation` file. Next.js does not install them.
 */
export type InstrumentationInject = {
  readonly file: string
  readonly page: `/${typeof INSTRUMENTATION_HOOK_FILENAME}`
  readonly specifiers: readonly string[]
}

/**
 * Resolves `injectInstrumentation`. Returns `undefined` when it is empty.
 *
 * Throws when any entry does not resolve from the project. Entries resolve
 * with Node's rules, so paths must include the file extension. Whoever sets
 * the option owns making those modules resolvable.
 */
export function resolveInstrumentationInject(opts: {
  readonly dir: string
  readonly config: Pick<NextConfigComplete, 'injectInstrumentation'>
}): InstrumentationInject | undefined {
  const specifiers = opts.config.injectInstrumentation ?? []
  if (specifiers.length === 0) {
    return undefined
  }

  for (const entry of specifiers) {
    try {
      require.resolve(entry, { paths: [opts.dir] })
    } catch {
      throw new Error(
        `\`injectInstrumentation\` entry ${JSON.stringify(entry)} does not resolve from the project.\n` +
          'The module must be resolvable from the project root, and paths must include the file extension. Next.js does not install it.'
      )
    }
  }
  return {
    file: INSTRUMENTATION_INJECT_STUB_PATH,
    page: `/${INSTRUMENTATION_HOOK_FILENAME}`,
    specifiers,
  }
}
