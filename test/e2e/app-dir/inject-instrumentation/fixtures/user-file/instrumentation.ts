type Store = typeof globalThis & { __instrumentation?: string }

// Top-level await makes this an async module, so require() returns a promise.
await Promise.resolve()

export function register() {
  ;(globalThis as Store).__instrumentation = 'user'
  console.log(`[user-instrumentation] register ${process.env.NEXT_RUNTIME}`)
}
