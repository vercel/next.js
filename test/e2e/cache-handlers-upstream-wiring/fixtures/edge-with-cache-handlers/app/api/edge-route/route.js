export const runtime = 'edge'
export const dynamic = 'force-dynamic'

export async function GET() {
  // The edge route wrapper registers the configured `cacheHandlers` in this
  // global map before invoking the route handler.
  const handlers = globalThis[Symbol.for('@next/cache-handlers-map')]

  return Response.json({
    ok: true,
    default: handlers?.get('default')?.wiringMarker ?? null,
    custom: handlers?.get('custom')?.wiringMarker ?? null,
  })
}
