import path from 'path'

export const NEXT_PROJECT_ROOT = path.join(__dirname, '..', '..')
export const NEXT_PROJECT_ROOT_DIST = path.join(NEXT_PROJECT_ROOT, 'dist')
export const NEXT_PROJECT_ROOT_DIST_CLIENT = path.join(
  NEXT_PROJECT_ROOT_DIST,
  'client'
)

/**
 * The webpack entry for the instrumentation slot when `instrumentationInject`
 * is set. `next-instrumentation-inject-loader` replaces its contents with a
 * module that runs every entry's hooks, then the project's own
 * `instrumentation` file.
 */
export const INSTRUMENTATION_INJECT_STUB_PATH = path.join(
  NEXT_PROJECT_ROOT_DIST,
  'build/webpack/loaders/instrumentation-inject-stub.js'
)
