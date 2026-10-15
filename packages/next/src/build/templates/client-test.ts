const { startClientTest } =
  // eslint-disable-next-line @next/internal/typechecked-require
  require('next/dist/experimental/testing/client/runtime') as typeof import('../../experimental/testing/client/runtime')

void startClientTest(() => {
  // Actual native internal reference preserves the original source and compiler.
  // eslint-disable-next-line @next/internal/typechecked-require
  return require(/*turbopackChunkingType: shared*/ 'VAR_TEST_MODULE')
})
