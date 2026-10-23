type Store = typeof globalThis & { __instrumentation?: string }

export function probe() {
  return Response.json({
    instrumentation: (globalThis as Store).__instrumentation ?? 'none',
  })
}
