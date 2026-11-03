export function markInjected(name) {
  globalThis.__instrumentation = 'inject'
  globalThis.__injected = [...(globalThis.__injected ?? []), name]
  console.log(
    `[inject-instrumentation] register ${name} ${process.env.NEXT_RUNTIME}`
  )
}
