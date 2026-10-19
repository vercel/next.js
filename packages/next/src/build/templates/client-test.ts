const { startClientTest } =
  // eslint-disable-next-line @next/internal/typechecked-require
  require('next/dist/experimental/testing/client/runtime') as typeof import('../../experimental/testing/client/runtime')

let moduleMocks: Parameters<typeof startClientTest>[1]
declare const __turbopack_context__: import('../../experimental/testing/runner/imports').TurbopackImportContext

// INJECT_RAW:__next_test_client_mocks__

void startClientTest(
  () => {
    // Actual native internal reference preserves the original source and compiler.
    // eslint-disable-next-line @next/internal/typechecked-require
    return require(/*turbopackChunkingType: shared*/ 'VAR_TEST_MODULE')
  },
  moduleMocks,
  () => {
    const { createModuleImportTracker } =
      // eslint-disable-next-line @next/internal/typechecked-require
      require('next/dist/experimental/testing/runner') as typeof import('../../experimental/testing/runner')
    return createModuleImportTracker(__turbopack_context__)
  },
  () =>
    (
      import.meta as unknown as {
        env: Record<string, string | boolean | undefined>
      }
    ).env
)
