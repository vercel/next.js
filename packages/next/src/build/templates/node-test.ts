// Explicit Node unit/browser-driver entry. Collection and imports share one
// runtime; no React server condition or App Router renderer is installed here.
// INJECT_RAW:__next_test_environment__

export const testRunner =
  // eslint-disable-next-line @next/internal/typechecked-require
  require('next/dist/experimental/testing/runner/index') as typeof import('../../experimental/testing/runner/index')

export const browserTesting =
  // eslint-disable-next-line @next/internal/typechecked-require
  require('next/dist/experimental/testing/browser/index') as typeof import('../../experimental/testing/browser/index')

// INJECT_RAW:__next_test_mock_runtime__

export async function loadTestModule() {
  // INJECT_RAW:__next_test_mock_load__
  // eslint-disable-next-line @next/internal/typechecked-require
  return require(/*turbopackChunkingType: shared*/ 'VAR_TEST_MODULE')
}

// These imports are compiled in the spec context and evaluated after collection starts.
export async function loadSetupModules(
  setupFilesSequence: 'list' | 'parallel' = 'list'
): Promise<void> {
  void setupFilesSequence // Referenced by the compiler-injected setup loaders.
  // INJECT_RAW:__next_test_setup__
}

// Observe the same compiler runtime that evaluates this file's user modules.
declare const __turbopack_context__: import('../../experimental/testing/runner/imports').TurbopackImportContext
export function initializeModuleImportTracking() {
  return testRunner.createModuleImportTracker(__turbopack_context__)
}
