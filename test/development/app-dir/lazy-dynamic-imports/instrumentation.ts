export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { value } = await import('./lib/instrumentation-target')
    console.log(value)
  }
}
