export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    require('./instrumentation-node').register()
  }
}
