export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.__NEXT_TEST_MODE) {
      require('./instrumentation-node-test').register()
    } else {
      // We use this instrumentation for easier debugging with this test.
      // We want this test to be executable with `pnpm next-with-deps`.
      require('./instrumentation-node').register()
    }
  }
}
