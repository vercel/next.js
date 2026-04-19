export async function register() {
  const { register: registerForTest } = await import('./instrumentation-test')

  if (process.env.__NEXT_TEST_MODE) {
    registerForTest()
  } else if (process.env.NEXT_RUNTIME === 'nodejs') {
    // We use this instrumentation for easier debugging with this test.
    // We want this test to be executable with `pnpm next-with-deps`.
    require('./instrumentation-node').register()
  }
}
