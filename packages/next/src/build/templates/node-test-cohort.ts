// One immutable compiler graph/runtime owns every explicitly listed Node spec.
// INJECT_RAW:__next_test_environment__

export const testRunner =
  // eslint-disable-next-line @next/internal/typechecked-require
  require('next/dist/experimental/testing/runner/index') as typeof import('../../experimental/testing/runner/index')

/** Numeric indices are assigned by the compiler, never module paths from IPC. */
export async function loadTestModule(index: number): Promise<unknown> {
  switch (index) {
    // INJECT_RAW:__next_test_cohort_load__
    default:
      throw new Error('Unknown compiled test cohort index')
  }
}

declare const __turbopack_context__: import('../../experimental/testing/runner/imports').TurbopackImportContext
export function initializeModuleImportTracking() {
  return testRunner.createModuleImportTracker(__turbopack_context__)
}
