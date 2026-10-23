type Store = typeof globalThis & { __instrumentation?: string }

export function register() {
  ;(globalThis as Store).__instrumentation = 'user'
  console.log(`[user-instrumentation] register ${process.env.NEXT_RUNTIME}`)
}
