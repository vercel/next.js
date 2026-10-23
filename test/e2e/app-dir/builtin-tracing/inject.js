export function register() {
  globalThis.__instrumentation = 'inject'
  console.log(`[inject-instrumentation] register ${process.env.NEXT_RUNTIME}`)
}
