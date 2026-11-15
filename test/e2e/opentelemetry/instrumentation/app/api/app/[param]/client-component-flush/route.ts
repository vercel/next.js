const forceFlushKey = Symbol.for('opentelemetry.test/forceFlush')

export const runtime = 'nodejs'

export async function POST() {
  const flush = (
    globalThis as typeof globalThis &
      Record<symbol, (() => Promise<void>) | undefined>
  )[forceFlushKey]
  if (!flush) {
    return new Response('OpenTelemetry test flush hook is unavailable', {
      status: 503,
    })
  }

  await flush()
  return new Response(null, { status: 204 })
}
