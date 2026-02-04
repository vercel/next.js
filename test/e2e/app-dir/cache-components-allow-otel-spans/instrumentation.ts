export async function register() {
  if (process.env.NEXT_RUNTIME !== 'edge') {
    await import('./instrumentation.node')
  }
}
