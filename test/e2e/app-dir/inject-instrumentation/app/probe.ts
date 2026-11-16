type Store = typeof globalThis & {
  __instrumentation?: string
  __injected?: string[]
}

export function probe() {
  const store = globalThis as Store
  return Response.json({
    instrumentation: store.__instrumentation ?? 'none',
    injected: store.__injected ?? [],
  })
}
