export function register() {
  const store = globalThis as { __userRegisterCount?: number }
  store.__userRegisterCount = (store.__userRegisterCount ?? 0) + 1
  console.log(`[user-instrumentation] register ${process.env.NEXT_RUNTIME}`)
}
