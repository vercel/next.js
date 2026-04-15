export async function register() {
  if (process.env.NEXT_RUNTIME !== 'edge' && process.env.__NEXT_TEST_MODE) {
    const { register: registerForTest } = await import('./instrumentation-test')
    registerForTest()
  }
}
