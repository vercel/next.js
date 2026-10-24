import '@opentelemetry/api-logs'

export function registerOTel() {
  globalThis.__instrumentation = 'inject'
  console.log(`[inject-instrumentation] register ${process.env.NEXT_RUNTIME}`)
}
