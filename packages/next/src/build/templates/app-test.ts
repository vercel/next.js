// This template is only instantiated by an explicitly registered testing entry.
// Keep runner, renderer and subject in the same emitted Turbopack runtime.
import * as ComponentMod from '../../server/app-render/entry-base' with { 'turbopack-transition': 'next-server-utility' }
export { ComponentMod }
export { setManifestsSingleton } from '../../server/app-render/manifests-singleton' with { 'turbopack-transition': 'next-server-utility' }
// The runner distribution is CJS-only. Keep its types pointed at source so
// declaration emission does not pull its own dist declarations back as inputs.
export const testRunner =
  // eslint-disable-next-line @next/internal/typechecked-require
  require('next/dist/experimental/testing/runner/index') as typeof import('../../experimental/testing/runner/index')
export const rscTesting =
  // eslint-disable-next-line @next/internal/typechecked-require
  require('next/dist/experimental/testing/rsc/index') as typeof import('../../experimental/testing/rsc/index')

// Inject the runtime import separately so this source is typed against source,
// while the template resolves the consumer's CJS distribution through SSR.
declare const __next_test_consumer__: typeof import('../../experimental/testing/rsc/consumer')
// INJECT_RAW:__next_test_consumer__
export { __next_test_consumer__ as ConsumerMod }

declare const __next_app_require__: (id: string | number) => unknown
declare const __next_app_load_chunk__: (id: string | number) => Promise<unknown>

// INJECT:__next_app_require__
// INJECT:__next_app_load_chunk__

export const __next_app__ = {
  require: __next_app_require__,
  loadChunk: __next_app_load_chunk__,
}

// The same installer is used by normal App Router rendering, including pending
// import tracking for the project's actual Cache Components compilation mode.
export function initializeRuntime() {
  ComponentMod.installGlobalModuleLoadingHandlers(
    { __next_app__ },
    !!process.env.__NEXT_CACHE_COMPONENTS
  )
}

// The worker installs the collector and manifests before evaluating the spec.
export function loadTestModule() {
  // The compiler replaces this internal asset; it has no source-level TS module.
  // eslint-disable-next-line @next/internal/typechecked-require
  return require(/*turbopackChunkingType: shared*/ 'VAR_TEST_MODULE')
}

// These imports are compiled in the spec context and evaluated after collection starts.
export async function loadSetupModules(): Promise<void> {
  // INJECT_RAW:__next_test_setup__
}
