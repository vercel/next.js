export async function register() {
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.ENABLE_OTEL === '1'
  ) {
    await import('./instrumentation.node')
  }
}
